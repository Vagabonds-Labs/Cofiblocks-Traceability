import { StaffRole } from '@prisma/client';

import { HttpException } from '@/exceptions/HttpException';
import { ContractFactory, EventsClient } from '@/lib/StellarContracts';
import { ROLES } from '@/lib/StellarContracts/types';
import { isSameAddress } from '@/lib/StellarContracts/utils';
import { logger } from '@/lib/logger';

const contracts = new ContractFactory();
const eventsClient = new EventsClient();

/** `StaffRole` de Prisma → rol del contrato. Los nombres coinciden. */
function toChainRole(role: StaffRole): ROLES {
  return ROLES[role as keyof typeof ROLES];
}

/**
 * Asigna un rol on-chain. La firma el backend, que es el admin del contrato.
 *
 * Después de confirmar la transacción se verifica el evento `role_granted`:
 * así lo que guarda la base sale de lo que pasó en la cadena.
 */
export async function grantRole(walletAddress: string, role: StaffRole, org: number): Promise<string> {
  const traceability = contracts.getTraceabilityService();
  const chainRole = toChainRole(role);
  const tx = await traceability.grantRole(walletAddress, chainRole, org);
  const { hash } = await contracts.getTxSubmitter().submitAsService(tx);

  const [event] = (await eventsClient.getTransactionEvents(hash)).parseRoleGranted();
  if (!event || event.role !== chainRole || event.org !== org || !isSameAddress(event.account, walletAddress)) {
    logger.error({ event, role, org, walletAddress, hash }, 'role_granted event does not match the request');
    throw new HttpException(502, 'Failed to assign role on chain', 'FAILED_TO_ASSIGN_ROLE');
  }
  logger.info({ walletAddress, role, org, hash }, 'Granted role on chain');
  return hash;
}

export async function revokeRole(walletAddress: string): Promise<string> {
  const tx = await contracts.getTraceabilityService().revokeRole(walletAddress);
  const { hash } = await contracts.getTxSubmitter().submitAsService(tx);
  logger.info({ walletAddress, hash }, 'Revoked role on chain');
  return hash;
}

/**
 * Vincula la wallet de un caficultor con su `farmer_ref`. La firma el backend
 * después de que el bot validó el ID contra la lista de la cooperativa.
 */
export async function registerFarmer(walletAddress: string, farmerRef: string, coop: number): Promise<string> {
  const tx = await contracts.getTraceabilityService().registerFarmer(walletAddress, farmerRef, coop);
  const { hash } = await contracts.getTxSubmitter().submitAsService(tx);

  const [event] = (await eventsClient.getTransactionEvents(hash)).parseFarmerRegistered();
  if (!event || event.farmer_ref !== farmerRef || !isSameAddress(event.account, walletAddress)) {
    logger.error({ event, farmerRef, walletAddress, hash }, 'farmer_registered event does not match');
    throw new HttpException(502, 'Failed to register farmer on chain', 'FAILED_TO_REGISTER_FARMER');
  }
  logger.info({ walletAddress, farmerRef, coop, hash }, 'Registered farmer on chain');
  return hash;
}

export async function getMember(walletAddress: string) {
  return contracts.getTraceabilityService().getMember(walletAddress);
}

export async function getBatch(id: string) {
  return contracts.getTraceabilityService().getBatch(id);
}
