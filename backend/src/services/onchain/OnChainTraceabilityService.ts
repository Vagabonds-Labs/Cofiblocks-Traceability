import { StaffRole } from '@prisma/client';
import { Address, scValToNative, Transaction, TransactionBuilder, xdr } from '@stellar/stellar-sdk';

import { HttpException } from '@/exceptions/HttpException';
import { ContractFactory, DEFAULT_VALIDITY_SECONDS, EventsClient, EventsParser, StellarClient } from '@/lib/StellarContracts';
import { ROLES } from '@/lib/StellarContracts/types';
import { isSameAddress, withAccountLock } from '@/lib/StellarContracts/utils';
import { logger } from '@/lib/logger';

const contracts = new ContractFactory();
const eventsClient = new EventsClient();

/**
 * Builds, signs and submits a transaction whose source is a backend account,
 * one at a time per account (see `withAccountLock`).
 */
function adminTransaction<T>(task: () => Promise<T>): Promise<T> {
  return withAccountLock(contracts.getClient().getServiceAddress(), task);
}

function farmerAgentTransaction<T>(task: () => Promise<T>): Promise<T> {
  return withAccountLock(contracts.getClient().getFarmerAgentKeypair().publicKey(), task);
}

/** Prisma `StaffRole` → contract role. The names match. */
function toChainRole(role: StaffRole): ROLES {
  return ROLES[role as keyof typeof ROLES];
}

/**
 * Assigns a role on chain. The backend, which is the contract admin, signs it.
 *
 * After the transaction is confirmed, the `role_granted` event is checked: that
 * way what the database stores comes from what happened on chain.
 */
export async function grantRole(walletAddress: string, role: StaffRole, org: number): Promise<string> {
  const traceability = contracts.getTraceabilityService();
  const chainRole = toChainRole(role);
  const { hash } = await adminTransaction(async () =>
    contracts.getTxSubmitter().submitAsService(await traceability.grantRole(walletAddress, chainRole, org))
  );

  const [event] = (await eventsClient.getTransactionEvents(hash)).parseRoleGranted();
  if (!event || event.role !== chainRole || event.org !== org || !isSameAddress(event.account, walletAddress)) {
    logger.error({ event, role, org, walletAddress, hash }, 'role_granted event does not match the request');
    throw new HttpException(502, 'Failed to assign role on chain', 'FAILED_TO_ASSIGN_ROLE');
  }
  logger.info({ walletAddress, role, org, hash }, 'Granted role on chain');
  return hash;
}

export async function revokeRole(walletAddress: string): Promise<string> {
  const { hash } = await adminTransaction(async () =>
    contracts.getTxSubmitter().submitAsService(await contracts.getTraceabilityService().revokeRole(walletAddress))
  );
  logger.info({ walletAddress, hash }, 'Revoked role on chain');
  return hash;
}

/** Builds a transaction signed by the farmer agent (see `Traceability`). */
export type FarmerAgentBuild = () => Promise<Transaction>;

/**
 * Submits a farmer-agent transaction: the farmer agent signs it (farmers have
 * no wallet) and the admin pays the fee with a fee-bump.
 *
 * `beforeSubmit` receives the final transaction hash and expiry before
 * anything is sent, so the caller can store them and reconcile later if the
 * outcome is unknown. If it throws, nothing is sent.
 */
export async function submitAsFarmerAgent(
  build: FarmerAgentBuild,
  beforeSubmit: (hash: string, validUntil: Date) => Promise<void>
): Promise<string> {
  return farmerAgentTransaction(async () => {
    const inner = await build();
    const envelope = contracts.getTxSubmitter().wrapInFeeBump(inner);
    const hash = Buffer.from(envelope.hash()).toString('hex');
    await beforeSubmit(hash, new Date(Number(inner.timeBounds!.maxTime) * 1000));
    await contracts.getTxSubmitter().submitEnvelope(envelope);
    return hash;
  });
}

/**
 * Submits a transaction signed by a staff wallet, with the admin paying the
 * fee (fee-bump). Like `submitAsFarmerAgent`, `beforeSubmit` gets the final
 * hash and expiry first. Check what was signed with `assertStaffInvocation`
 * before calling this.
 */
export async function submitStaffSigned(
  signedXdr: string,
  beforeSubmit: (hash: string, validUntil: Date) => Promise<void>
): Promise<string> {
  const inner = decodeSigned(signedXdr);
  const envelope = contracts.getTxSubmitter().wrapInFeeBump(inner);
  const hash = Buffer.from(envelope.hash()).toString('hex');
  await beforeSubmit(hash, new Date(Number(inner.timeBounds!.maxTime) * 1000));
  await contracts.getTxSubmitter().submitEnvelope(envelope);
  return hash;
}

function decodeSigned(signedXdr: string): Transaction {
  let tx: Transaction;
  try {
    tx = TransactionBuilder.fromXDR(signedXdr, contracts.getClient().networkPassphrase) as Transaction;
  } catch {
    throw new HttpException(400, 'Invalid signed transaction', 'INVALID_SIGNED_TX');
  }
  if (!('operations' in tx) || !tx.signatures?.length) {
    throw new HttpException(400, 'Transaction is not signed', 'UNSIGNED_TRANSACTION');
  }
  if (!tx.timeBounds?.maxTime || Number(tx.timeBounds.maxTime) === 0) {
    throw new HttpException(400, 'Transaction has no expiry', 'INVALID_SIGNED_TX');
  }
  contracts.getTxSubmitter().assertSignedForThisNetwork(tx);
  return tx;
}

/**
 * Checks that a transaction signed by a staff wallet is exactly the call the
 * backend prepared: one `traceability` invocation, from `source`, with these
 * method and arguments. Without this a client could sign and send something
 * else through our fee-bump, or record a call whose off-chain record we never
 * stored.
 */
export function assertStaffInvocation(signedXdr: string, source: string, method: string, args: xdr.ScVal[]): void {
  const tx = decodeSigned(signedXdr);
  const mismatch = (detail: string) =>
    new HttpException(400, `The signed transaction is not the one prepared (${detail})`, 'SIGNED_TX_MISMATCH');

  if (!isSameAddress(tx.source, source)) throw mismatch('source account');
  if (tx.operations.length !== 1 || tx.operations[0].type !== 'invokeHostFunction') throw mismatch('operation');
  const op = tx.operations[0];
  if (op.source && !isSameAddress(op.source, source)) throw mismatch('operation source');
  const fn = op.func;
  if (fn.type !== 'hostFunctionTypeInvokeContract') throw mismatch('function type');
  const call = fn.invokeContract;
  const contractId = Address.fromScAddress(call.contractAddress).toString();
  if (contractId !== contracts.getTraceabilityService().contractAddress) throw mismatch('contract');
  if (call.functionName.toString() !== method) throw mismatch('method');
  const signedArgs = call.args.map((arg: xdr.ScVal) => arg.toXDR('base64'));
  const expected = args.map((arg) => arg.toXDR('base64'));
  if (signedArgs.length !== expected.length || signedArgs.some((arg: string, i: number) => arg !== expected[i])) {
    const readable = (value: unknown) =>
      value instanceof Uint8Array ? Buffer.from(value).toString('hex') : typeof value === 'bigint' ? value.toString() : value;
    logger.warn({ method, signed: call.args.map((a: xdr.ScVal) => readable(scValToNative(a))) }, 'Signed arguments differ');
    throw mismatch('arguments');
  }
}

// ── staff transactions (signed by their own wallet) ──────────────────────

export function prepareReception(
  collector: string,
  id: string,
  weightGrams: bigint,
  receiptHash: string,
  dataHash: string
) {
  return contracts.getTraceabilityService().recordReception(collector, id, weightGrams, receiptHash, dataHash);
}

export function verifyReceptionRecorded(
  hash: string,
  id: string,
  collector: string,
  weightGrams: bigint,
  receiptHash: string,
  dataHash: string
): Promise<void> {
  return verifyTransaction(
    `record_reception ${id}`,
    hash,
    (events) =>
      events
        .parseReceptionRecorded()
        .some(
          (e) =>
            e.id === id &&
            isSameAddress(e.collector, collector) &&
            e.weight_grams === weightGrams.toString() &&
            e.receipt_hash === receiptHash &&
            e.data_hash === dataHash
        ),
    async () => {
      const batch = await findBatch(id);
      return (
        !!batch &&
        batch.weight_grams === weightGrams.toString() &&
        batch.receipt_hash === receiptHash &&
        batch.history.some((r) => r.stage === 'RECEIVED' && isSameAddress(r.actor, collector) && r.data_hash === dataHash)
      );
    }
  );
}

// ── farmer-agent transaction builders ─────────────────────────────────────

export const build = {
  registerFarmer: (farmerRef: string, coop: number): FarmerAgentBuild =>
    () => contracts.getTraceabilityService().registerFarmer(farmerRef, coop),
  recordConsent: (farmerRef: string, consentHash: string): FarmerAgentBuild =>
    () => contracts.getTraceabilityService().recordConsent(farmerRef, consentHash),
  setProfile: (farmerRef: string, profileHash: string): FarmerAgentBuild =>
    () => contracts.getTraceabilityService().setProfile(farmerRef, profileHash),
  createBatch: (id: string, farmerRef: string, center: number, dataHash: string): FarmerAgentBuild =>
    () => contracts.getTraceabilityService().createBatch(id, farmerRef, center, dataHash),
};

/**
 * Reads a confirmed transaction's events and checks them with `matches`.
 *
 * The RPC keeps transactions only for a few hours, so reconciling an old one
 * may not find its events. Then the contract's state is the lasting proof:
 * `fallback` checks it.
 */
async function verifyTransaction(
  label: string,
  hash: string,
  matches: (events: EventsParser) => boolean,
  fallback: () => Promise<boolean>
): Promise<void> {
  let events: EventsParser;
  try {
    events = await eventsClient.getTransactionEvents(hash);
  } catch (error) {
    if (!(error instanceof HttpException && error.code === 'TRANSACTION_NOT_FOUND')) throw error;
    if (!(await fallback())) throw error;
    logger.info({ label, hash }, 'On-chain write verified from contract state');
    return;
  }
  if (!matches(events)) {
    logger.error({ label, hash, events: events.getEvents() }, 'Transaction events do not match the request');
    throw new HttpException(502, `On-chain write did not match the request (${label})`, 'ONCHAIN_MISMATCH');
  }
  logger.info({ label, hash }, 'On-chain write confirmed');
}

export function verifyConsentRecorded(hash: string, farmerRef: string, consentHash: string): Promise<void> {
  return verifyTransaction(
    `record_consent ${farmerRef}`,
    hash,
    (events) => events.parseConsentRecorded().some((e) => e.farmer_ref === farmerRef && e.consent_hash === consentHash),
    async () => (await getFarmer(farmerRef))?.consent_hash === consentHash
  );
}

export function verifyProfileUpdated(hash: string, farmerRef: string, profileHash: string): Promise<void> {
  return verifyTransaction(
    `set_profile ${farmerRef}`,
    hash,
    (events) => events.parseProfileUpdated().some((e) => e.farmer_ref === farmerRef && e.profile_hash === profileHash),
    // A newer version may have replaced it on chain since; then the events
    // were the only proof and this one cannot be re-verified.
    async () => (await getFarmer(farmerRef))?.profile_hash === profileHash
  );
}

export function verifyBatchCreated(
  hash: string,
  id: string,
  farmerRef: string,
  center: number,
  dataHash: string
): Promise<void> {
  return verifyTransaction(
    `create_batch ${id}`,
    hash,
    (events) =>
      events
        .parseBatchCreated()
        .some((e) => e.id === id && e.farmer_ref === farmerRef && e.collection_center === center && e.data_hash === dataHash),
    async () => {
      const batch = await findBatch(id);
      return (
        !!batch &&
        batch.farmer_ref === farmerRef &&
        batch.collection_center === center &&
        batch.history[0]?.data_hash === dataHash
      );
    }
  );
}

/**
 * Checks that a confirmed transaction registered exactly this farmer.
 *
 * The RPC keeps transactions only for a few hours, so reconciling an old
 * registration may not find its events. The contract's state is the lasting
 * proof: if it already has this farmer in this cooperative, it is registered.
 */
export async function verifyFarmerRegistered(hash: string, farmerRef: string, coop: number): Promise<void> {
  let event;
  try {
    [event] = (await eventsClient.getTransactionEvents(hash)).parseFarmerRegistered();
  } catch (error) {
    if (!(error instanceof HttpException && error.code === 'TRANSACTION_NOT_FOUND')) throw error;
    const onChain = await getFarmer(farmerRef);
    if (onChain?.coop !== coop) throw error;
    logger.info({ farmerRef, coop, hash }, 'Farmer registration verified from contract state');
    return;
  }
  if (!event || event.farmer_ref !== farmerRef || event.coop !== coop) {
    logger.error({ event, farmerRef, coop, hash }, 'farmer_registered event does not match');
    throw new HttpException(502, 'Failed to register farmer on chain', 'FAILED_TO_REGISTER_FARMER');
  }
  logger.info({ farmerRef, coop, hash }, 'Registered farmer on chain');
}

/**
 * How a farmer-agent transaction ended (see `StellarClient.getTransactionOutcome`).
 * `validUntil` is the stored expiry of the transaction.
 */
export function getTransactionOutcome(hash: string, validUntil: Date | null) {
  return contracts
    .getClient()
    .getTransactionOutcome(hash, StellarClient.validityWindow(validUntil, DEFAULT_VALIDITY_SECONDS));
}

export async function getFarmer(farmerRef: string) {
  return contracts.getTraceabilityService().getFarmer(farmerRef);
}

export async function getMember(walletAddress: string) {
  return contracts.getTraceabilityService().getMember(walletAddress);
}

export async function getBatch(id: string) {
  return contracts.getTraceabilityService().getBatch(id);
}

/** Like `getBatch`, but `null` when the batch does not exist on chain. */
export async function findBatch(id: string) {
  try {
    return await getBatch(id);
  } catch (error) {
    if (error instanceof HttpException && error.code === 'BATCH_NOT_FOUND') return null;
    throw error;
  }
}

/** The farmer agent's address: the actor of every `Delivered` record. */
export function getFarmerAgentAddress(): string {
  return contracts.getClient().getFarmerAgentKeypair().publicKey();
}
