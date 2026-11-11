import { StaffRole } from '@prisma/client';

import { HttpException } from '@/exceptions/HttpException';
import { ContractFactory, DEFAULT_VALIDITY_SECONDS, EventsClient, StellarClient } from '@/lib/StellarContracts';
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

/**
 * Registers a farmer on chain by their `farmer_ref`. The farmer agent signs it
 * (farmers have no wallet) and the admin pays the fee with a fee-bump. The
 * caller must have checked the ID against the cooperative's list first.
 *
 * `beforeSubmit` receives the final transaction hash and expiry before
 * anything is sent, so the caller can store them and reconcile later if the
 * outcome is unknown. If it throws, nothing is sent.
 */
export async function registerFarmer(
  farmerRef: string,
  coop: number,
  beforeSubmit: (hash: string, validUntil: Date) => Promise<void>
): Promise<string> {
  const hash = await farmerAgentTransaction(async () => {
    const inner = await contracts.getTraceabilityService().registerFarmer(farmerRef, coop);
    const envelope = contracts.getTxSubmitter().wrapInFeeBump(inner);
    const hash = Buffer.from(envelope.hash()).toString('hex');
    await beforeSubmit(hash, new Date(Number(inner.timeBounds!.maxTime) * 1000));
    await contracts.getTxSubmitter().submitEnvelope(envelope);
    return hash;
  });
  await verifyFarmerRegistered(hash, farmerRef, coop);
  return hash;
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
