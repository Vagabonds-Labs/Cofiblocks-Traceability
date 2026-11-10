import { createHash } from 'crypto';
import { Keypair } from '@stellar/stellar-sdk';

import { HttpException } from '@/exceptions/HttpException';
import { isClassicAddress, isContractAddress } from '@/lib/StellarContracts/utils';
import { logger } from '@/lib/logger';

/**
 * Prefijo de SEP-53. Es lo que las wallets anteponen antes de hashear, para que
 * un mensaje firmado nunca pueda pasar por una transacción firmada.
 */
const SEP53_PREFIX = 'Stellar Signed Message:\n';

/** `SHA256("Stellar Signed Message:\n" + mensaje)`, que es lo que se firma. */
export function hashSignedMessage(message: string): Buffer {
  return createHash('sha256')
    .update(Buffer.concat([Buffer.from(SEP53_PREFIX, 'utf8'), Buffer.from(message, 'utf8')]))
    .digest();
}

/**
 * Verifica una firma de wallet en local, sin tocar la red.
 *
 * En Starknet había que llamar a `is_valid_signature` del contrato de cuenta del
 * usuario, con reintentos porque el RPC fallaba. Las cuentas clásicas de Stellar
 * son claves ed25519: se verifican con la clave pública y nada más.
 *
 * Las cuentas contrato (`C…`, smart wallets y passkeys) no se verifican así.
 * v1 las rechaza con un error explícito en vez de fallar de forma confusa.
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
 * Prefijo con el que firma mensajes Cavos (`@cavos/kit`, `prefixedMessageBytes`).
 *
 * No es SEP-53: Cavos firma los bytes `"Cavos Signed Message:\n" + largo + "\n"
 * + mensaje` directamente con ed25519, sin hashear antes.
 */
const CAVOS_PREFIX = 'Cavos Signed Message:\n';

/** Los bytes que firma Cavos para `message`. */
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
 * Verifica el login de una wallet de Cavos.
 *
 * En Cavos la cuenta Stellar (`address`) es una multisig y quien firma es la
 * "control key" del dispositivo (`signer`). En el primer dispositivo la control
 * key es la misma dirección que la cuenta; en un dispositivo aprobado después
 * es otra clave, agregada como firmante de la cuenta.
 *
 * Por eso, además de la firma, se verifica que `signer` controle `address`:
 * - si son la misma dirección, alcanza con la firma;
 * - si no, la cuenta tiene que existir en la red y tener a `signer` como
 *   firmante con peso suficiente. Una cuenta que todavía no existe no se puede
 *   comprobar, y se rechaza en vez de confiar en lo que diga el cliente.
 *
 * `loadAccount` devuelve la cuenta tal como la ve Horizon, o `null` si no existe.
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
