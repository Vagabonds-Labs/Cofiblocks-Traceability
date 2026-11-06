import { prisma } from '@/lib/prisma';
import { Prisma, StaffRole } from '@prisma/client';

/** Campos de `User` que circulan por la app. */
const USER_SELECT = {
  id: true,
  name: true,
  email: true,
  telegramUsername: true,
  walletAddress: true,
  walletProvider: true,
  isAdmin: true,
  role: true,
  organizationId: true,
  collectionCenterId: true,
  roleTx: true,
  createdAt: true,
  updatedAt: true,
  organization: { select: { id: true, name: true, code: true, kind: true } },
  collectionCenter: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

export type UserEntry = Prisma.UserGetPayload<{ select: typeof USER_SELECT }>;

export interface CreateUserEntry {
  walletAddress: string;
  walletProvider?: string | null;
  isAdmin?: boolean;
}

export interface UpdateUserEntry {
  name?: string;
  email?: string;
  telegramUsername?: string | null;
  isAdmin?: boolean;
  role?: StaffRole | null;
  organizationId?: string | null;
  collectionCenterId?: string | null;
  roleTx?: string | null;
}

export class DbUsers {
  async findUserById(id: string): Promise<UserEntry | null> {
    return prisma.user.findUnique({ where: { id }, select: USER_SELECT });
  }

  async findUserByWalletAddress(walletAddress: string): Promise<UserEntry | null> {
    return prisma.user.findUnique({ where: { walletAddress }, select: USER_SELECT });
  }

  async createUser(data: CreateUserEntry): Promise<UserEntry> {
    return prisma.user.create({
      data: {
        walletAddress: data.walletAddress,
        walletProvider: data.walletProvider || 'stellar',
        isAdmin: data.isAdmin || false,
      },
      select: USER_SELECT,
    });
  }

  async updateUser(userId: string, data: UpdateUserEntry): Promise<UserEntry> {
    return prisma.user.update({ where: { id: userId }, data, select: USER_SELECT });
  }

  async countUsers(where: Prisma.UserWhereInput): Promise<number> {
    return prisma.user.count({ where });
  }

  async findUsersWithFilters(
    where: Prisma.UserWhereInput,
    limit: number,
    offset: number
  ): Promise<UserEntry[]> {
    return prisma.user.findMany({
      where,
      select: USER_SELECT,
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteUser(userId: string): Promise<void> {
    await prisma.user.delete({ where: { id: userId } });
  }
}
