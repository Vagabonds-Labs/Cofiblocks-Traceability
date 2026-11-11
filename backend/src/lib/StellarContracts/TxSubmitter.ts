import { FeeBumpTransaction, Keypair, rpc, StrKey, Transaction, TransactionBuilder } from '@stellar/stellar-sdk';

import { HttpException } from '@/exceptions/HttpException';
import { logger } from '@/lib/logger';
import { StellarClient } from './StellarClient';
import { toDomainError } from './errors';
import { SubmittedTransaction } from './types/transactions';

/** Fee the backend sets when wrapping the user's transaction, in stroops. */
const FEE_BUMP_BASE_FEE = '100000';

const POLL_INTERVAL_MS = 1_000;
const POLL_TIMEOUT_MS = 45_000;

/**
 * Takes the transaction signed by the user, wraps it in a fee-bump and sends it
 * to the network.
 *
 * The backend pays the fee with its own account, so no user needs XLM. This is
 * also where the hash comes from — more reliable than trusting the one the
 * client reports.
 */
export class TxSubmitter {
  constructor(private readonly client: StellarClient) {}

  /**
   * Submits a transaction signed by the user, with the backend paying the fee.
   *
   * `feeBump: false` is for transactions where the backend is already the
   * source account and therefore already pays the fee — for example a
   * sponsored trustline.
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

    return this.send(this.wrapInFeeBump(inner).toXDR());
  }

  /**
   * Wraps a signed transaction in a fee-bump paid and signed by the admin.
   *
   * Exposed so a caller can learn the final hash (the fee-bump's) before
   * submitting, store it, and later find out how the submission ended.
   */
  public wrapInFeeBump(inner: Transaction): FeeBumpTransaction {
    const feeBump = TransactionBuilder.buildFeeBumpTransaction(
      this.client.getServiceKeypair(),
      FEE_BUMP_BASE_FEE,
      inner,
      this.client.networkPassphrase
    );
    feeBump.sign(this.client.getServiceKeypair());
    return feeBump;
  }

  /** Submits an already signed envelope (for example from `wrapInFeeBump`). */
  public submitEnvelope(tx: Transaction | FeeBumpTransaction): Promise<SubmittedTransaction> {
    return this.send(tx.toXDR());
  }

  /**
   * Detects a signature made for another network.
   *
   * A Stellar signature covers the transaction hash, and that hash includes the
   * network passphrase. Some wallets — LOBSTR — ignore the requested network
   * and always sign for mainnet. On testnet that showed up as an unhelpful
   * `tx_bad_auth`; here it is recognized and explained.
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
        // In SDK 17 `hint` and `signature` are wrappers with the bytes in `.value`.
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

  /** Submits a transaction already signed by the backend (roles, farmers). */
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
