import { StaffRole } from '@prisma/client';

import { HttpException } from '@/exceptions/HttpException';
import { ContractFactory, EventsClient } from '@/lib/StellarContracts';
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
 */
export async function registerFarmer(farmerRef: string, coop: number): Promise<string> {
  const { hash } = await farmerAgentTransaction(async () => {
    const tx = await contracts.getTraceabilityService().registerFarmer(farmerRef, coop);
    return contracts.getTxSubmitter().submitSigned(tx.toXDR());
  });

  const [event] = (await eventsClient.getTransactionEvents(hash)).parseFarmerRegistered();
  if (!event || event.farmer_ref !== farmerRef || event.coop !== coop) {
    logger.error({ event, farmerRef, coop, hash }, 'farmer_registered event does not match');
    throw new HttpException(502, 'Failed to register farmer on chain', 'FAILED_TO_REGISTER_FARMER');
  }
  logger.info({ farmerRef, coop, hash }, 'Registered farmer on chain');
  return hash;
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
