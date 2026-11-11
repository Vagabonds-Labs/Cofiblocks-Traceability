/**
 * Loads the pilot organizations: the union, the 3 cooperatives in Jimma Zone /
 * Gomma Woreda and their collection centers.
 *
 *   npm run db:seed
 *
 * Idempotent: it can run again without duplicating anything. The `chainId`s
 * are the numeric IDs the contract uses and **cannot change** once there are
 * batches on chain.
 *
 * The center names come from the pilot PDF ("CofiBlocks Traceability App Flow
 * – Ethiopia Pilot", section 6); how compound names are split is still to be
 * confirmed with Ethiopia.
 */
import 'dotenv/config';
import { OrganizationKind, PrismaClient } from '@prisma/client';

const LOCATION = { region: 'Oromia', zone: 'Jimma', woreda: 'Gomma' };

const UNION = {
  code: 'UNION',
  name: 'Coffee Farmers Cooperative Union',
  chainId: 100,
};

const COOPERATIVES = [
  {
    code: 'KK',
    name: 'Kilole Kirkir Cooperative',
    chainId: 1,
    centers: [
      { name: 'Kirkir', chainId: 11 },
      { name: 'Simbo', chainId: 12 },
      { name: 'Madha Bereha', chainId: 13 },
      { name: 'Nagade', chainId: 14 },
    ],
  },
  {
    code: 'DM',
    name: 'Dandi Misoma Cooperative',
    chainId: 2,
    centers: [
      { name: 'Sayiti', chainId: 21 },
      { name: 'Kiltu Holka', chainId: 22 },
      { name: 'Amuma', chainId: 23 },
    ],
  },
  {
    code: 'KN',
    name: 'Kananisa Cooperative',
    chainId: 3,
    centers: [
      { name: 'Kochi', chainId: 31 },
      { name: 'Kiltu Bada', chainId: 32 },
      { name: 'Buna Melka', chainId: 33 },
      { name: 'Yeddu Yeriyo', chainId: 34 },
    ],
  },
];

async function main() {
  const prisma = new PrismaClient();
  try {
    await prisma.organization.upsert({
      where: { code: UNION.code },
      create: { ...UNION, kind: OrganizationKind.UNION, ...LOCATION },
      update: { name: UNION.name },
    });
    console.log(`✓ ${UNION.name}`);

    for (const coop of COOPERATIVES) {
      const organization = await prisma.organization.upsert({
        where: { code: coop.code },
        create: {
          code: coop.code,
          name: coop.name,
          chainId: coop.chainId,
          kind: OrganizationKind.COOPERATIVE,
          ...LOCATION,
        },
        update: { name: coop.name },
      });
      for (const center of coop.centers) {
        await prisma.collectionCenter.upsert({
          where: { chainId: center.chainId },
          create: { ...center, organizationId: organization.id },
          update: { name: center.name },
        });
      }
      console.log(`✓ ${coop.name} (${coop.centers.length} centers)`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
