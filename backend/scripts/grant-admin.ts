/**
 * Grants admin rights to the user of a wallet.
 *
 *   npm run admin:grant -- G…
 *
 * It exists because with a new database there is no way to create the first
 * admin from the app: `updateAdminStatus` requires being an admin already. The
 * user must have signed in at least once with their wallet, so the row exists.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { StrKey } from '@stellar/stellar-sdk';

async function main() {
  const walletAddress = process.argv[2];
  if (!walletAddress || !StrKey.isValidEd25519PublicKey(walletAddress)) {
    console.error('Usage: npm run admin:grant -- <Stellar account G…>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ where: { walletAddress } });
    if (!user) {
      console.error(
        `There is no user with the wallet ${walletAddress}. ` +
          'They have to sign in once with their wallet before being made admin.'
      );
      process.exit(1);
    }
    if (user.isAdmin) {
      console.log(`${walletAddress} is already an admin (user ${user.id}).`);
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
    console.log(`✓ ${walletAddress} is now an admin (user ${user.id}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
