import { randomBytes } from 'crypto';

import { HttpException } from '@/exceptions/HttpException';
import { DbAuthNonce } from '@/services/db';
import { isClassicAddress } from '@/lib/StellarContracts/utils';

const dbAuthNonce = new DbAuthNonce();

/** Short window: the user signs right away or requests a new one. */
const NONCE_TTL_SECONDS = 5 * 60;

export interface IssuedNonce {
  nonce: string;
  /** The literal message the wallet has to sign, SEP-53 format. */
  message: string;
  expires_at: number;
}

/**
 * Issues a single-use nonce for signature login.
 *
 * Previously the client generated it (`Date.now()-random` in
 * `webapp/utils/signature.ts`) and the backend never issued or invalidated it,
 * so the same signature worked forever. Now it comes from here, expires in 5
 * minutes and can be used once.
 */
export async function issueNonce(walletAddress?: string): Promise<IssuedNonce> {
  if (walletAddress && !isClassicAddress(walletAddress)) {
    throw new HttpException(
      400,
      'Only classic Stellar accounts (G…) are supported',
      'UNSUPPORTED_ACCOUNT_TYPE'
    );
  }

  const nonce = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + NONCE_TTL_SECONDS * 1000);
  await dbAuthNonce.createNonce(nonce, expiresAt, walletAddress);

  return {
    nonce,
    message: buildLoginMessage(nonce),
    expires_at: Math.floor(expiresAt.getTime() / 1000),
  };
}

/** The message that gets signed. Human-readable so the user sees what they sign. */
export function buildLoginMessage(nonce: string): string {
  return `CofiBlocks login\nnonce: ${nonce}`;
}

/**
 * Consumes the nonce. Fails if the backend did not issue it, if it was already
 * used or if it expired.
 */
export async function consumeNonce(nonce: string, walletAddress: string): Promise<void> {
  const entry = await dbAuthNonce.consumeNonce(nonce);
  if (!entry) {
    throw new HttpException(401, 'Invalid, expired or already used nonce', 'INVALID_NONCE');
  }
  if (entry.walletAddress && entry.walletAddress !== walletAddress) {
    throw new HttpException(401, 'Nonce was issued for a different wallet', 'NONCE_WALLET_MISMATCH');
  }
}
