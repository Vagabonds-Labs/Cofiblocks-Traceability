/**
 * SOW evidence for deliverable 2, on Stellar Testnet:
 *
 *   1. A farmer creates a batch — through the VoiceLedger integration API,
 *      signed exactly as VoiceLedger's bot signs it (link → consent → profile
 *      → delivery), plus a retry with the same event_id.
 *   2. A Collector adds an authorized event — `record_reception` (weight and
 *      receipt), prepared by the backend, signed with the Collector's own
 *      key, and sent with the backend's fee-bump: the same path the web app
 *      uses with Cavos `signXdr`.
 *   3. Unauthorized attempts rejected by the contract — sent straight to the
 *      network without simulating, so they land as failed transactions on
 *      Stellar Expert with the contract's error code:
 *        a. a Collector of another cooperative tries to record the weight
 *           (WRONG_ORGANIZATION, #4), before the real reception;
 *        b. the batch's Collector tries to record the weight a second time
 *           (RECEPTION_ALREADY_RECORDED, #13).
 *      The backend API refuses both earlier; sending them to the chain
 *      directly proves the contract enforces the rules on its own.
 *
 *   npm run sow:evidence -- KK ID001 [--center Kirkir] [--other-coop DM] [--out ../docs/sow-evidence.md]
 *
 * Needs the backend running (API_URL, default http://localhost:4000) on the
 * same database as this script (DATABASE_URL), VOICELEDGER_WEBHOOK_SECRET, and
 * the farmer on the cooperative's list. Creates two throwaway Collector
 * accounts (Friendbot) and users named "SOW evidence …" on every run.
 */
import 'dotenv/config';
import { createHash } from 'crypto';
import { writeFileSync } from 'fs';
import {
  Address,
  Contract,
  Keypair,
  Operation,
  rpc,
  SorobanDataBuilder,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';
import { StaffRole } from '@prisma/client';

import { ContractFactory } from '@/lib/StellarContracts';
import { addressVal, bytes32Val, stringVal, u64Val } from '@/lib/StellarContracts/utils/scval';
import { prisma } from '@/lib/prisma';
import * as ReceptionService from '@/services/app/ReceptionService';
import * as UsersService from '@/services/app/UsersService';
import { getExplorerBaseURL } from '@/services/onchain/OnChainEnvService';
import { ensureAccount } from '@/services/onchain/OnChainAccountsService';

import { farmerJourney, sendOk } from './lib/voiceledger';

const contracts = new ContractFactory();
const client = contracts.getClient();
const explorer = (hash: string) => `${getExplorerBaseURL()}/tx/${hash}`;

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

interface EvidenceRow {
  proof: string;
  step: string;
  outcome: string;
  hash: string;
}
const rows: EvidenceRow[] = [];

function record(proof: string, step: string, outcome: string, hash: string) {
  rows.push({ proof, step, outcome, hash });
  console.log(`  ${outcome === 'success' ? '✓' : '✗ (expected)'} ${step}`);
  console.log(`    ${explorer(hash)}`);
}

/** A fresh testnet account with a staff role, in the database and on chain. */
async function createCollector(coopCode: string, centerName: string | null) {
  const coop = await prisma.organization.findUniqueOrThrow({
    where: { code: coopCode },
    include: { collectionCenters: true },
  });
  const center = centerName
    ? coop.collectionCenters.find((c) => c.name.toLowerCase() === centerName.toLowerCase())
    : coop.collectionCenters[0];
  if (!center) throw new Error(`No collection center ${centerName} in ${coopCode}`);

  const keypair = Keypair.random();
  await ensureAccount(keypair.publicKey());
  const user = await prisma.user.create({
    data: {
      name: `SOW evidence collector ${coopCode} ${new Date().toISOString().slice(0, 16)}`,
      walletAddress: keypair.publicKey(),
      walletProvider: 'evidence-script',
    },
  });
  const { tx_hash } = await UsersService.assignRole(user.id, StaffRole.COLLECTOR, coop.id, center.id);
  return { keypair, user, coop, center, roleTx: tx_hash };
}

function sorobanDataOf(tx: Transaction): xdr.SorobanTransactionData {
  const envelope = tx.toEnvelope() as unknown as { type: string; value: { tx: { ext: { type: string; value: xdr.SorobanTransactionData } } } };
  if (envelope.type !== 'envelopeTypeTx' || envelope.value.tx.ext.type !== 'sorobanData') {
    throw new Error('Prepared transaction has no Soroban data');
  }
  return envelope.value.tx.ext.value;
}

/** Footprint keys a read touches, from simulating it. */
async function footprintOf(method: string, args: xdr.ScVal[]): Promise<xdr.LedgerKey[]> {
  const contract = new Contract(contracts.getTraceabilityService().contractAddress);
  const tx = new TransactionBuilder(await client.rpc.getAccount(client.getServiceAddress()), {
    fee: '1000',
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(contract.call(method, ...args))
    .setTimeout(60)
    .build();
  const simulation = await client.rpc.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulation)) throw new Error(`simulate ${method}: ${simulation.error}`);
  return new SorobanDataBuilder(simulation.transactionData.build()).getReadOnly();
}

/**
 * Sends a contract call signed by `signer` WITHOUT simulating it, so the
 * network runs it and the contract rejects it on chain. Simulation would stop
 * it before it is ever sent. The footprint and resources come from a
 * simulation of a valid call on the same batch (`base`) plus `extraReadOnly`.
 */
async function sendUnsimulated(
  signer: Keypair,
  method: string,
  args: xdr.ScVal[],
  base: xdr.SorobanTransactionData,
  extraReadOnly: xdr.LedgerKey[] = []
): Promise<{ hash: string; status: string; contractError: number | null }> {
  const contractId = contracts.getTraceabilityService().contractAddress;
  const invocation = new xdr.InvokeContractArgs({
    contractAddress: new Address(contractId).toScAddress(),
    functionName: method,
    args,
  });
  const auth = new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function: xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(invocation),
      subInvocations: [],
    }),
  });

  const data = new SorobanDataBuilder(base);
  const seen = new Set(data.getReadOnly().concat(data.getReadWrite()).map((k) => k.toXDR('base64')));
  const readOnly = data.getReadOnly().concat(extraReadOnly.filter((k) => !seen.has(k.toXDR('base64'))));
  const resources = (base as unknown as { resources: { instructions: number; diskReadBytes: number; writeBytes: number } }).resources;
  const resourceFee = BigInt((base as unknown as { resourceFee: bigint | string }).resourceFee.toString()) * 2n + 100_000n;
  data
    .setReadOnly(readOnly)
    .setResources(Number(resources.instructions) * 2, Number(resources.diskReadBytes) * 2 + 2048, Number(resources.writeBytes))
    .setResourceFee(resourceFee);

  const tx = new TransactionBuilder(await client.rpc.getAccount(signer.publicKey()), {
    // Inclusion fee only: \`build()\` adds the Soroban resource fee itself.
    fee: '1000',
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(Operation.invokeHostFunction({ func: xdr.HostFunction.hostFunctionTypeInvokeContract(invocation), auth: [auth] }))
    .setSorobanData(data.build())
    .setTimeout(300)
    .build();
  tx.sign(signer);
  const envelope = contracts.getTxSubmitter().wrapInFeeBump(tx);
  const hash = Buffer.from(envelope.hash()).toString('hex');

  const sent = await client.rpc.sendTransaction(envelope);
  if (sent.status === 'ERROR') {
    throw new Error(`The network refused to include ${method} (it did not land): ${JSON.stringify(sent.errorResult)}`);
  }
  for (let i = 0; i < 45; i++) {
    const result = await client.rpc.getTransaction(hash);
    if (result.status !== rpc.Api.GetTransactionStatus.NOT_FOUND) {
      const dump = JSON.stringify(result, (_k, v) => (typeof v === 'bigint' ? v.toString() : v));
      // The contract's error is in the diagnostic events: `{"error":{"contract":N}}`.
      const match = /"error":\{"contract":(\d+)\}/.exec(dump);
      return { hash, status: result.status, contractError: match ? Number(match[1]) : null };
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${method} ${hash} was not confirmed in time`);
}

/** Table order: setup first, then the three SOW proofs in order. */
function proofOrder(proof: string): number {
  return proof === 'Setup' ? 0 : Number(proof[0]);
}

/** The attempt must have landed and failed with exactly this contract error. */
function expectRejected(attempt: { hash: string; status: string; contractError: number | null }, code: number) {
  if (attempt.status !== 'FAILED' || attempt.contractError !== code) {
    throw new Error(
      `Expected a failed transaction with Error(Contract, #${code}), got ${attempt.status} / #${attempt.contractError}: ${explorer(attempt.hash)}`
    );
  }
}

async function main() {
  const [coopCode, farmerId] = process.argv.slice(2).filter((arg, i, all) => !arg.startsWith('--') && !all[i - 1]?.startsWith('--'));
  if (!coopCode || !farmerId) {
    console.error('Usage: npm run sow:evidence -- <COOP_CODE> <FARMER_ID> [--center <name>] [--other-coop <code>] [--out <file.md>]');
    process.exit(1);
  }
  const centerName = option('--center', 'Kirkir');
  const otherCoop = option('--other-coop', coopCode.toUpperCase() === 'DM' ? 'KK' : 'DM');
  const contractId = contracts.getTraceabilityService().contractAddress;
  console.log(`Contract ${contractId} on ${client.network}\n`);

  // ── 1. a farmer creates a batch (VoiceLedger API) ──────────────────────
  console.log('1. A farmer creates a batch (VoiceLedger integration API, farmer-agent wallet)');
  const journey = await farmerJourney({ coopCode, farmerId, center: centerName, kg: 45 });
  const batchId = String(journey.delivery.result.batch_id);
  record('1. Farmer creates a batch', `register_farmer ${journey.farmerRef}`, 'success', String(journey.linked.result.tx_hash));
  record('1. Farmer creates a batch', 'record_consent (EUDR)', 'success', String(journey.consent.result.tx_hash));
  record('1. Farmer creates a batch', `set_profile v${journey.profile.result.profile_version}`, 'success', String(journey.profile.result.tx_hash));
  record('1. Farmer creates a batch', `create_batch "${batchId}"`, 'success', String(journey.delivery.result.tx_hash));
  const retry = await sendOk('delivery.created', journey.deliveryData, journey.delivery.eventId);
  if (retry.result.tx_hash !== journey.delivery.result.tx_hash) throw new Error('Retry produced a different transaction');
  console.log('  ✓ Same event_id sent again: same batch and transaction, nothing new on chain');

  // ── staff accounts ─────────────────────────────────────────────────────
  console.log('\nCreating a Collector for the batch\'s cooperative and one for another cooperative');
  const collector = await createCollector(coopCode.toUpperCase(), centerName);
  const outsider = await createCollector(otherCoop.toUpperCase(), null);
  record('Setup', `grant_role Collector → ${collector.coop.code} (${collector.keypair.publicKey().slice(0, 6)}…)`, 'success', collector.roleTx);
  record('Setup', `grant_role Collector → ${outsider.coop.code} (${outsider.keypair.publicKey().slice(0, 6)}…)`, 'success', outsider.roleTx);

  // A receipt "photo" for the demo: its SHA-256 goes on chain.
  const receipt = Buffer.from(`Receipt for ${batchId}: 44.75 kg, ${new Date().toISOString()}`);
  const input = {
    batchNumber: batchId,
    weightKg: 44.75,
    receiptSha256: createHash('sha256').update(receipt).digest('hex'),
    notes: 'SOW evidence',
  };
  const { prepared } = await ReceptionService.prepareReception(collector.user.id, input);
  const preparedTx = TransactionBuilder.fromXDR(prepared.xdr, client.networkPassphrase) as Transaction;
  const baseData = sorobanDataOf(preparedTx);
  const preparedArgs = [
    addressVal(collector.keypair.publicKey()),
    stringVal(batchId),
    u64Val(44_750n),
    bytes32Val(input.receiptSha256),
  ];

  // ── 3a. another cooperative's Collector, before the real reception ─────
  console.log('\n3. Unauthorized attempts, sent to the contract without simulation');
  try {
    await ReceptionService.prepareReception(outsider.user.id, input);
    throw new Error('The backend accepted a Collector from another cooperative');
  } catch (error) {
    console.log(`  ✓ The backend API refuses it first: ${(error as { code?: string }).code}`);
  }
  const outsiderArgs = [addressVal(outsider.keypair.publicKey()), ...preparedArgs.slice(1), bytes32Val('00'.repeat(32))];
  const wrongOrg = await sendUnsimulated(
    outsider.keypair,
    'record_reception',
    outsiderArgs,
    baseData,
    await footprintOf('get_member', [addressVal(outsider.keypair.publicKey())])
  );
  expectRejected(wrongOrg, 4);
  record(
    '3. Unauthorized attempt rejected on chain',
    `record_reception by a ${outsider.coop.code} Collector on a ${collector.coop.code} batch → Error(Contract, #${wrongOrg.contractError}) WRONG_ORGANIZATION`,
    'failed',
    wrongOrg.hash
  );

  // ── 2. the batch's Collector records weight and receipt ────────────────
  console.log('\n2. A Collector adds an authorized event (signed with their own wallet, backend fee-bump)');
  preparedTx.sign(collector.keypair);
  const reception = await ReceptionService.submitReception(collector.user.id, input, preparedTx.toXDR());
  record('2. Collector adds an authorized event', `record_reception "${batchId}": 44.75 kg + receipt hash`, 'success', reception.tx_hash);
  const again = await ReceptionService.submitReception(collector.user.id, input, preparedTx.toXDR());
  if (again.tx_hash !== reception.tx_hash) throw new Error('Re-submitting produced a different transaction');
  console.log('  ✓ Submitting the same signed transaction again: same result, nothing new on chain');

  // ── 3b. second reception of the same batch ─────────────────────────────
  console.log('\n3. Unauthorized attempts (continued)');
  const twice = await sendUnsimulated(collector.keypair, 'record_reception', [...preparedArgs, bytes32Val('11'.repeat(32))], baseData);
  expectRejected(twice, 13);
  record(
    '3. Unauthorized attempt rejected on chain',
    `record_reception a second time on "${batchId}" → Error(Contract, #${twice.contractError}) RECEPTION_ALREADY_RECORDED`,
    'failed',
    twice.hash
  );

  const batch = await contracts.getTraceabilityService().getBatch(batchId);
  console.log(`\nOn chain now: "${batch.id}" is ${batch.stage}, ${Number(batch.weight_grams) / 1000} kg, history ${batch.history.map((h) => h.stage).join(' → ')}`);

  const out = process.argv.includes('--out') ? option('--out', '') : '';
  if (out) {
    const lines = [
      `# SOW evidence — deliverable 2 (${new Date().toISOString().slice(0, 10)})`,
      '',
      `Contract: [\`${contractId}\`](${getExplorerBaseURL()}/contract/${contractId}) on Stellar ${client.network}.`,
      `Batch: \`${batchId}\` (farmer \`${journey.farmerRef}\`). Final state on chain: ${batch.stage}, ${Number(batch.weight_grams) / 1000} kg.`,
      '',
      '| Proof | Call | Result | Transaction |',
      '|---|---|---|---|',
      ...[...rows].sort((a, b) => proofOrder(a.proof) - proofOrder(b.proof)).map((r) => `| ${r.proof} | ${r.step.replace(/\|/g, '\\|')} | ${r.outcome === 'success' ? 'Succeeded' : 'Rejected by the contract'} | [${r.hash.slice(0, 10)}…](${explorer(r.hash)}) |`),
      '',
      'Generated with `npm run sow:evidence` (backend). Farmer steps go through the VoiceLedger integration API signed like the VoiceLedger bot; the farmer-agent wallet signs them on chain. The Collector signs with their own wallet and the backend pays the fee (fee-bump). The rejected attempts were sent without simulation so the contract itself rejects them on chain.',
      '',
    ];
    writeFileSync(out, lines.join('\n'));
    console.log(`\nEvidence written to ${out}`);
  }
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
