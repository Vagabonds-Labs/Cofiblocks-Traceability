import { createHash } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';

import { HttpException } from '@/exceptions/HttpException';
import { isClassicAddress, isContractAddress } from '@/lib/StellarContracts/utils';
import { logger } from '@/lib/logger';

/**
 * SEP-53 prefix. Wallets prepend it before hashing, so that a signed message
 * can never pass for a signed transaction.
 */
const SEP53_PREFIX = 'Stellar Signed Message:\n';

/** `SHA256("Stellar Signed Message:\n" + message)`, which is what gets signed. */
export function hashSignedMessage(message: string): Buffer {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from(SEP53_PREFIX, 'utf8'), Buffer.from(message, 'utf8')]))
    .digest();
}

/**
 * Verifies a wallet signature locally, without touching the network.
 *
 * On Starknet we had to call `is_valid_signature` on the user's account
 * contract, with retries because the RPC was flaky. Classic Stellar accounts
 * are ed25519 keys: they are verified with the public key and nothing else.
 *
 * Contract accounts (`C…`, smart wallets and passkeys) are not verified this
 * way. v1 rejects them with an explicit error instead of failing confusingly.
 */
export function verifyStellarSignature(
  address: string,
  message: string,
  signature: string
): boolean {
  if (isContractAddress(address)) {
    throw new HttpException(
      400,
      'Smart wallet accounts (C…) are not supported yet. Connect a classic Stellar account.',
      'UNSUPPORTED_ACCOUNT_TYPE'
    );
  }
  if (!isClassicAddress(address)) {
    throw new HttpException(401, 'Invalid Stellar address', 'INVALID_ADDRESS');
  }

  let isValid = false;
  try {
    isValid = Keypair.fromPublicKey(address).verify(
      hashSignedMessage(message),
      Buffer.from(signature, 'base64')
    );
  } catch (error) {
    logger.warn({ error, address }, 'Could not verify Stellar signature');
    throw new HttpException(401, 'Invalid signature', 'INVALID_SIGNATURE');
  }

  if (!isValid) {
    throw new HttpException(401, 'Invalid signature', 'INVALID_SIGNATURE');
  }
  return true;
}

/**
 * Prefix Cavos uses when signing messages (`@cavos/kit`, `prefixedMessageBytes`).
 *
 * It is not SEP-53: Cavos signs the bytes `"Cavos Signed Message:\n" + length +
 * "\n" + message` directly with ed25519, without hashing first.
 */
const CAVOS_PREFIX = 'Cavos Signed Message:\n';

/** The bytes Cavos signs for `message`. */
export function cavosSignedMessageBytes(message: string): Buffer {
  const body = Buffer.from(message, 'utf8');
  return Buffer.concat([
    Buffer.from(CAVOS_PREFIX, 'utf8'),
    Buffer.from(String(body.length), 'utf8'),
    Buffer.from('\n', 'utf8'),
    body,
  ]);
}

/**
 * Verifies a Cavos wallet login.
 *
 * In Cavos the Stellar account (`address`) is a multisig, and the signer is the
 * device's "control key" (`signer`). On the first device the control key is the
 * same address as the account; on a device approved later it is a different
 * key, added as a signer of the account.
 *
 * So besides the signature, we check that `signer` controls `address`:
 * - if they are the same address, the signature is enough;
 * - otherwise the account must exist on the network and have `signer` as a
 *   signer with enough weight. An account that does not exist yet cannot be
 *   checked, so it is rejected instead of trusting what the client says.
 *
 * `loadAccount` returns the account as Horizon sees it, or `null` if it does
 * not exist.
 */
export async function verifyCavosSignature(
  address: string,
  signer: string,
  message: string,
  signature: string,
  loadAccount: (address: string) => Promise<{
    signers: { key: string; weight: number }[];
    thresholds: { med_threshold: number };
  } | null>
): Promise<void> {
  if (!isClassicAddress(address) || !isClassicAddress(signer)) {
    throw new HttpException(401, 'Invalid Stellar address', 'INVALID_ADDRESS');
  }

  let isValid = false;
  try {
    isValid = Keypair.fromPublicKey(signer).verify(
      cavosSignedMessageBytes(message),
      Buffer.from(signature, 'base64')
    );
  } catch (error) {
    logger.warn({ error, address, signer }, 'Could not verify Cavos signature');
  }
  if (!isValid) {
    throw new HttpException(401, 'Invalid signature', 'INVALID_SIGNATURE');
  }

  if (signer === address) return;

  const account = await loadAccount(address);
  if (!account) {
    throw new HttpException(
      401,
      'This device key cannot be linked to the account yet. Try again from the device where the account was created.',
      'CAVOS_SIGNER_NOT_VERIFIABLE'
    );
  }
  const entry = account.signers.find((s) => s.key === signer);
  const required = Math.max(account.thresholds.med_threshold, 1);
  if (!entry || entry.weight < required) {
    throw new HttpException(401, 'The signing key does not control this account', 'INVALID_SIGNER');
  }
}
