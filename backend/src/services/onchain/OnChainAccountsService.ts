import { BASE_FEE, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

import { HttpException } from '@/exceptions/HttpException';
import { ContractFactory } from '@/lib/StellarContracts';
import { isClassicAddress } from '@/lib/StellarContracts/utils';
import { logger } from '@/lib/logger';

const contractFactory = new ContractFactory();

/**
 * Saldo con el que el backend crea la cuenta de un usuario.
 *
 * La reserva base de una cuenta es 1 XLM. El usuario nunca paga fees (los paga
 * el backend con fee-bump), así que no necesita más que eso. Con 200
 * participantes en el piloto son unos 200 XLM en mainnet.
 */
const STARTING_BALANCE_XLM = '1';

/** `true` si la cuenta ya existe en la red. */
export async function existsOnNetwork(address: string): Promise<boolean> {
  return (await contractFactory.getClient().loadAccountOrNull(address)) !== null;
}

/**
 * Crea la cuenta del usuario si todavía no existe.
 *
 * Hace falta porque las transacciones que firma el usuario lo usan como source
 * account, y Cavos crea la cuenta recién con el primer `execute`. La crea y la
 * fondea el backend: el usuario no firma nada.
 *
 * Devuelve el hash de la transacción, o `null` si la cuenta ya existía.
 */
export async function ensureAccount(address: string): Promise<string | null> {
  if (!isClassicAddress(address)) {
    throw new HttpException(400, 'Only classic Stellar accounts (G…) are supported', 'UNSUPPORTED_ACCOUNT_TYPE');
  }
  if (await existsOnNetwork(address)) return null;

  const client = contractFactory.getClient();
  const sponsor = client.getServiceKeypair();
  const sponsorAccount = await client.rpc.getAccount(sponsor.publicKey());
  const tx = new TransactionBuilder(sponsorAccount, {
    fee: BASE_FEE,
    networkPassphrase: client.networkPassphrase,
  })
    .addOperation(Operation.createAccount({ destination: address, startingBalance: STARTING_BALANCE_XLM }))
    .setTimeout(60)
    .build();
  tx.sign(sponsor);

  const { hash } = await contractFactory.getTxSubmitter().submitAsService(tx);
  logger.info({ address, hash }, 'Created user account on chain');
  return hash;
}
