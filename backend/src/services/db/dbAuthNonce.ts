import { prisma } from '@/lib/prisma';

export interface AuthNonceEntry {
  id: string;
  nonce: string;
  walletAddress: string | null;
  expiresAt: Date;
  consumedAt: Date | null;
}

export class DbAuthNonce {
  async createNonce(nonce: string, expiresAt: Date, walletAddress?: string): Promise<AuthNonceEntry> {
    return prisma.authNonce.create({
      data: { nonce, expiresAt, walletAddress: walletAddress ?? null },
    });
  }

  /**
   * Marks the nonce as consumed and returns whether it was valid.
   *
   * The `updateMany` with `consumedAt: null` in the where clause means two
   * simultaneous requests cannot consume the same nonce: the second one
   * updates 0 rows.
   */
  async consumeNonce(nonce: string): Promise<AuthNonceEntry | null> {
    const entry = await prisma.authNonce.findUnique({ where: { nonce } });
    if (!entry || entry.consumedAt || entry.expiresAt < new Date()) {
      return null;
    }
    const consumed = await prisma.authNonce.updateMany({
      where: { nonce, consumedAt: null },
      data: { consumedAt: new Date() },
    });
    return consumed.count === 1 ? entry : null;
  }

  /** Cleanup of expired nonces. */
  async deleteExpired(): Promise<number> {
    const result = await prisma.authNonce.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }
}
