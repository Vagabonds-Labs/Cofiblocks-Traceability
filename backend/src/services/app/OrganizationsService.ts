import { prisma } from '@/lib/prisma';

/** Cooperatives and union, with their collection centers and farmer counts. */
export async function listOrganizations() {
  return prisma.organization.findMany({
    orderBy: [{ kind: 'asc' }, { chainId: 'asc' }],
    include: {
      collectionCenters: { orderBy: { chainId: 'asc' } },
      _count: { select: { farmers: true, users: true } },
    },
  });
}

export async function findCooperativeByCode(code: string) {
  return prisma.organization.findFirst({
    where: { code: code.trim().toUpperCase(), kind: 'COOPERATIVE' },
    include: { collectionCenters: true },
  });
}

export async function listCooperatives() {
  return prisma.organization.findMany({
    where: { kind: 'COOPERATIVE' },
    orderBy: { chainId: 'asc' },
  });
}
