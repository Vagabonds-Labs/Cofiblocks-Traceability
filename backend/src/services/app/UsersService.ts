import { OrganizationKind, Prisma, StaffRole } from '@prisma/client';

import { HttpException } from '@/exceptions/HttpException';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { DbRefreshToken, DbSessions, DbUsers, UserEntry } from '@/services/db';
import * as OnChainTraceabilityService from '@/services/onchain/OnChainTraceabilityService';
import { ContractFactory } from '@/lib/StellarContracts';
import { verifyCavosSignature, verifyStellarSignature } from '@/utils/stellarSignature';
import * as NonceService from './NonceService';
import * as NotificationService from './NotificationService';
import { RegisterUserData, UserResponse } from './types';

const dbUsers = new DbUsers();
const dbRefreshToken = new DbRefreshToken();
const dbSessions = new DbSessions();

export async function getUserById(userId: string) {
  return dbUsers.findUserById(userId);
}

export async function registerUser(
  data: RegisterUserData
): Promise<{ user: UserEntry; isNewUser: boolean }> {
  if (!data.signature) {
    throw new HttpException(400, 'Signature is required for wallet registration');
  }

  // The nonce must have been issued by the backend and not used before.
  await NonceService.consumeNonce(data.nonce, data.walletAddress);

  const message = NonceService.buildLoginMessage(data.nonce);
  if (data.walletProvider === 'cavos') {
    // Cavos signs with its own prefix and, on a device added later, with a key
    // other than the account: we have to check that it controls the account.
    const client = new ContractFactory().getClient();
    await verifyCavosSignature(
      data.walletAddress,
      data.signer ?? data.walletAddress,
      message,
      data.signature,
      (address) => client.loadAccountOrNull(address)
    );
  } else {
    // Local ed25519 verification, SEP-53 format. No network call needed.
    verifyStellarSignature(data.walletAddress, message, data.signature);
  }

  const existingUser = await dbUsers.findUserByWalletAddress(data.walletAddress);
  if (existingUser) {
    return { user: existingUser, isNewUser: false };
  }

  const user = await dbUsers.createUser({
    walletAddress: data.walletAddress,
    walletProvider: data.walletProvider || 'stellar',
    isAdmin: false,
  });
  return { user, isNewUser: true };
}

export async function updateUser(
  userId: string,
  data: { name?: string; email?: string }
): Promise<UserResponse> {
  return dbUsers.updateUser(userId, data);
}

/** User list with filters and pagination (admin). */
export async function getAllUsers(filters: {
  role?: StaffRole;
  organizationId?: string;
  isAdmin?: boolean;
  email?: string;
  name?: string;
  walletAddress?: string;
  walletProvider?: string;
  limit?: number;
  offset?: number;
}): Promise<{ users: UserResponse[]; total: number }> {
  const where: Prisma.UserWhereInput = {};
  if (filters.role) where.role = filters.role;
  if (filters.organizationId) where.organizationId = filters.organizationId;
  if (filters.isAdmin !== undefined) where.isAdmin = filters.isAdmin;
  if (filters.email) where.email = { contains: filters.email, mode: 'insensitive' };
  if (filters.name) where.name = { contains: filters.name, mode: 'insensitive' };
  if (filters.walletAddress) {
    where.walletAddress = { contains: filters.walletAddress, mode: 'insensitive' };
  }
  if (filters.walletProvider) {
    where.walletProvider = { contains: filters.walletProvider, mode: 'insensitive' };
  }

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;
  const [total, users] = await Promise.all([
    dbUsers.countUsers(where),
    dbUsers.findUsersWithFilters(where, limit, offset),
  ]);
  return { users, total };
}

export async function updateAdminStatus(userId: string, isAdmin: boolean): Promise<UserResponse> {
  return dbUsers.updateUser(userId, { isAdmin });
}

export async function deleteUser(userId: string): Promise<void> {
  await dbRefreshToken.deleteRefreshTokensByUserId(userId);
  await dbSessions.markAllSessionsInactive(userId);
  await dbUsers.deleteUser(userId);
}

/**
 * Assigns a pilot role to a user: first in the contract (the backend signs as
 * admin) and, if the transaction is confirmed, in the database.
 *
 * - The Export Manager belongs to the union; everyone else, to a cooperative.
 * - The Coffee Collector also needs their collection center, which must belong
 *   to the same cooperative.
 */
export async function assignRole(
  userId: string,
  role: StaffRole,
  organizationId: string,
  collectionCenterId?: string | null
): Promise<{ user: UserResponse; tx_hash: string }> {
  const user = await dbUsers.findUserById(userId);
  if (!user) throw new HttpException(404, 'User not found', 'USER_NOT_FOUND');
  if (!user.walletAddress) {
    throw new HttpException(400, 'User has no wallet', 'USER_WITHOUT_WALLET');
  }

  const organization = await prisma.organization.findUnique({ where: { id: organizationId } });
  if (!organization) {
    throw new HttpException(404, 'Organization not found', 'ORGANIZATION_NOT_FOUND');
  }
  const expectedKind =
    role === StaffRole.EXPORT_MANAGER ? OrganizationKind.UNION : OrganizationKind.COOPERATIVE;
  if (organization.kind !== expectedKind) {
    throw new HttpException(
      400,
      role === StaffRole.EXPORT_MANAGER
        ? 'The Export Manager belongs to the union'
        : 'This role belongs to a cooperative',
      'ROLE_ORGANIZATION_MISMATCH'
    );
  }

  let centerId: string | null = null;
  if (role === StaffRole.COLLECTOR) {
    if (!collectionCenterId) {
      throw new HttpException(400, 'Collectors need a collection center', 'COLLECTION_CENTER_REQUIRED');
    }
    const center = await prisma.collectionCenter.findUnique({ where: { id: collectionCenterId } });
    if (!center || center.organizationId !== organization.id) {
      throw new HttpException(
        400,
        'The collection center does not belong to that cooperative',
        'COLLECTION_CENTER_MISMATCH'
      );
    }
    centerId = center.id;
  }

  const txHash = await OnChainTraceabilityService.grantRole(
    user.walletAddress,
    role,
    organization.chainId
  );

  const updated = await dbUsers.updateUser(userId, {
    role,
    organizationId: organization.id,
    collectionCenterId: centerId,
    roleTx: txHash,
  });
  logger.info({ userId, role, organization: organization.code, txHash }, 'Role assigned');
  await NotificationService.pushInfoNotification(userId, 'ROLE_ASSIGNED', [role]);
  return { user: updated, tx_hash: txHash };
}

/** Removes the role from the contract and the database. */
export async function revokeRole(userId: string): Promise<{ user: UserResponse; tx_hash: string }> {
  const user = await dbUsers.findUserById(userId);
  if (!user) throw new HttpException(404, 'User not found', 'USER_NOT_FOUND');
  if (!user.walletAddress || !user.role) {
    throw new HttpException(400, 'User has no role to revoke', 'NO_ROLE');
  }

  const txHash = await OnChainTraceabilityService.revokeRole(user.walletAddress);
  const updated = await dbUsers.updateUser(userId, {
    role: null,
    organizationId: null,
    collectionCenterId: null,
    roleTx: txHash,
  });
  logger.info({ userId, txHash }, 'Role revoked');
  await NotificationService.pushInfoNotification(userId, 'ROLE_REVOKED', [user.role]);
  return { user: updated, tx_hash: txHash };
}
