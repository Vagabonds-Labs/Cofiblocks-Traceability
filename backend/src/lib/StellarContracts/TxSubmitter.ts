import { Keypair, rpc, StrKey, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';

import { HttpException } from '@/exceptions/HttpException';
import { logger } from '@/lib/logger';
import { StellarClient } from './StellarClient';
import { toDomainError } from './errors';
import { SubmittedTransaction } from './types/transactions';

/** Fee que pone el backend al envolver la transacción del usuario, en stroops. */
const FEE_BUMP_BASE_FEE = '100000';

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 45_000;

/**
 * Recibe la transacción firmada por el usuario, la envuelve en un fee-bump y la
 * manda a la red.
 *
 * El backend paga el fee con su propia cuenta, así ningún usuario necesita
 * tener XLM. También es de acá de donde
 * sale el hash — más confiable que confiar en el que reporte el cliente.
 */
export class TxSubmitter {
  constructor(private readonly client: StellarClient) {}

  /**
   * Envía una transacción firmada por el usuario, pagando el fee el backend.
   *
   * `feeBump: false` sirve para las transacciones donde el backend ya es la
   * source account y por lo tanto ya paga el fee — por ejemplo una trustline
   * patrocinada.
   */
  public async submitSigned(
    signedXdr: string,
    options: { feeBump?: boolean } = {}
  ): Promise<SubmittedTransaction> {
    let inner: Transaction;
    try {
      inner = TransactionBuilder.fromXDR(
        signedXdr,
        this.client.networkPassphrase
      ) as Transaction;
    } catch (error) {
      logger.error({ error }, 'Could not decode signed transaction XDR');
      throw new HttpException(400, 'Invalid signed transaction', 'INVALID_SIGNED_TX');
    }

    if (!inner.signatures || inner.signatures.length === 0) {
      throw new HttpException(400, 'Transaction is not signed', 'UNSIGNED_TRANSACTION');
    }

    this.assertSignedForThisNetwork(inner);

    if (options.feeBump === false) {
      return this.send(inner.toXDR());
    }

    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      this.client.getServiceKeypair(),
      FEE_BUMP_BASE_FEE,
      inner,
      this.client.networkPassphrase
    );
    feeBump.sign(this.client.getServiceKeypair());

    return this.send(feeBump.toXDR());
  }

  /**
   * Detecta una firma hecha para otra red.
   *
   * La firma de Stellar cubre el hash de la transacción, y ese hash incluye la
   * passphrase de la red. Algunas wallets — LOBSTR — ignoran la red que se les
   * pide y firman siempre para mainnet. En testnet eso llegaba como un
   * `tx_bad_auth` que no explica nada; acá se reconoce y se dice qué pasó.
   */
  private assertSignedForThisNetwork(tx: Transaction): void {
    const hash = tx.hash();
    const signers = new Set<string>(
      [tx.source, ...tx.operations.map((op) => op.source)].filter(
        (address): address is string => !!address && StrKey.isValidEd25519PublicKey(address)
      )
    );

    for (const address of signers) {
      const keypair = Keypair.fromPublicKey(address);
      const hint = keypair.signatureHint();
      for (const signature of tx.signatures) {
        // En el SDK 17 `hint` y `signature` son envoltorios con los bytes en `.value`.
        if (!Buffer.from(signature.hint.value).equals(hint)) continue;
        if (!keypair.verify(hash, Buffer.from(signature.signature.value))) {
          throw new HttpException(
            400,
            'The wallet signed this transaction for a different Stellar network. ' +
              'Switch the wallet to the network the app is using and try again.',
            'WRONG_NETWORK_SIGNATURE'
          );
        }
      }
    }
  }

  /** Envía una transacción que ya firmó el backend (roles, caficultores). */
  public async submitAsService(tx: Transaction): Promise<SubmittedTransaction> {
    return this.send(tx.toXDR());
  }

  private async send(envelopeXdr: string): Promise<SubmittedTransaction> {
    const tx = TransactionBuilder.fromXDR(envelopeXdr, this.client.networkPassphrase);
    const response = await this.client.rpc.sendTransaction(tx);

    if (response.status === 'ERROR') {
      const detail = JSON.stringify(response.errorResult ?? {});
      logger.error({ detail }, 'Soroban rejected the transaction on submit');
      throw toDomainError(detail);
    }
    if (response.status === 'DUPLICATE') {
      logger.info({ hash: response.hash }, 'Transaction already submitted, polling for result');
    }

    return this.waitForConfirmation(response.hash);
  }

  private async waitForConfirmation(hash: string): Promise<SubmittedTransaction> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const result = await this.client.rpc.getTransaction(hash);

      if (result.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return { hash, ledger: result.ledger };
      }
      if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
        const detail = JSON.stringify(result.resultXdr ?? {});
        logger.error({ hash, detail }, 'Transaction failed on chain');
        throw toDomainError(detail);
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    throw new HttpException(
      504,
      'Timed out waiting for the transaction to be confirmed',
      'TRANSACTION_TIMEOUT'
    );
  }
}
