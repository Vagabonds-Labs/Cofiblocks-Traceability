/**
 * Writes the roles stored in the database to the current contract.
 *
 *   npm run chain:sync-roles
 *
 * Run it after deploying a new contract (the roles live in the old one) or
 * when setting up a new environment from an existing database. Users whose
 * on-chain role already matches are skipped; the others get a new `roleTx`.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

import * as OnChainTraceabilityService from '@/services/onchain/OnChainTraceabilityService';

async function main() {
  const prisma = new PrismaClient();
  try {
    const users = await prisma.user.findMany({
      where: { role: { not: null }, walletAddress: { not: null }, organizationId: { not: null } },
      include: { organization: true },
    });
    console.log(`${users.length} users with a role`);

    let granted = 0;
    for (const user of users) {
      const address = user.walletAddress!;
      const org = user.organization!.chainId;
      const current = await OnChainTraceabilityService.getMember(address);
      if (current && current.role === user.role && current.org === org) {
        console.log(`= ${address} already ${user.role} in org ${org}`);
        continue;
      }
      const roleTx = await OnChainTraceabilityService.grantRole(address, user.role!, org);
      await prisma.user.update({ where: { id: user.id }, data: { roleTx } });
      console.log(`✓ ${address} → ${user.role} in org ${org} (${roleTx})`);
      granted += 1;
    }
    console.log(`Done: ${granted} granted, ${users.length - granted} already in sync.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
