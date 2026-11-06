/**
 * Da rol de admin al usuario de una wallet.
 *
 *   npm run admin:grant -- G…
 *
 * Existe porque con una base nueva no hay forma de crear el primer admin desde
 * la app: `updateAdminStatus` exige ya ser admin. El usuario tiene que haber
 * entrado al menos una vez con su wallet, así la fila existe.
 */
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { StrKey } from '@stellar/stellar-sdk';

async function main() {
  const walletAddress = process.argv[2];
  if (!walletAddress || !StrKey.isValidEd25519PublicKey(walletAddress)) {
    console.error('Uso: npm run admin:grant -- <cuenta Stellar G…>');
    process.exit(1);
  }

  const prisma = new PrismaClient();
  try {
    const user = await prisma.user.findFirst({ where: { walletAddress } });
    if (!user) {
      console.error(
        `No hay usuario con la wallet ${walletAddress}. ` +
          'Tiene que entrar una vez con su wallet antes de darle admin.'
      );
      process.exit(1);
    }
    if (user.isAdmin) {
      console.log(`${walletAddress} ya es admin (usuario ${user.id}).`);
      return;
    }
    await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
    console.log(`✓ ${walletAddress} ahora es admin (usuario ${user.id}).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
