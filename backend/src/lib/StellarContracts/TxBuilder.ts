import {
  Account,
  Contract,
  rpc,
  Transaction,
  TransactionBuilder,
  xdr,
} from '@stellar/stellar-sdk';

import { logger } from '@/lib/logger';
import { StellarClient } from './StellarClient';
import { ContractKind, toDomainError } from './errors';
import { PreparedTransaction } from './types/transactions';

/** How long a prepared transaction stays valid before it has to be requested again. */
const DEFAULT_VALIDITY_SECONDS = 5 * 60;

/** Base fee per operation, in stroops. The fee-bump covers the rest. */
const BASE_FEE = '1000';

export interface InvocationRequest {
  contractId: string;
  method: string;
  args?: xdr.ScVal[];
  /** Contract the method belongs to, used to translate its error codes. */
  kind?: ContractKind;
}

/**
 * Builds, simulates and returns transactions ready to sign.
 *
 * The backend builds the whole transaction, simulates it to get the
 * footprint, auth entries and fee, and returns the XDR.
 *
 * **The user is always the source account.** That way the contract's
 * `require_auth` is satisfied with `SOURCE_ACCOUNT` credentials and there are
 * no separate authorization entries to sign.
 */
export class TxBuilder {
  constructor(private readonly client: StellarClient) {}

  /** Read: simulates and returns the value, without writing to the network. */
  public async read<T = unknown>(request: InvocationRequest): Promise<T> {
    const tx = this.buildUnsigned(
      // Simulation does not check the sequence or require the account to exist:
      // reading should not depend on the backend's secret key.
      new Account(this.client.getReadSourceAddress(), '0'),
      request,
      DEFAULT_VALIDITY_SECONDS
    );

    const simulation = await this.client.rpc.simulateTransaction(tx);
    this.assertSimulationOk(simulation, request);

    const success = simulation as rpc.Api.SimulateTransactionSuccessResponse;
    if (!success.result) {
      throw toDomainError('simulation returned no value', request.kind);
    }
    return success.result.retval as unknown as T;
  }

  /**
   * Write signed by the user: returns the simulated XDR for the wallet to sign
   * (SEP-43 `signTransaction`).
   */
  public async prepare(
    source: string,
    request: InvocationRequest,
    validForSeconds: number = DEFAULT_VALIDITY_SECONDS
  ): Promise<PreparedTransaction> {
    const account = await this.client.rpc.getAccount(source);
    const tx = this.buildUnsigned(account, request, validForSeconds);

    const simulation = await this.client.rpc.simulateTransaction(tx);
    this.assertSimulationOk(simulation, request);

    const assembled = rpc
      .assembleTransaction(tx, simulation as rpc.Api.SimulateTransactionSuccessResponse)
      .build();

    return {
      xdr: assembled.toXDR(),
      network_passphrase: this.client.networkPassphrase,
      valid_until: Math.floor(Date.now() / 1000) + validForSeconds,
    };
  }

  /**
   * Write signed by the backend with its own account (role assignment, farmer
   * linking). Returns the signed transaction, ready to submit.
   */
  public async prepareAsService(
    request: InvocationRequest,
    validForSeconds: number = DEFAULT_VALIDITY_SECONDS
  ): Promise<Transaction> {
    const keypair = this.client.getServiceKeypair();
    const account = await this.client.rpc.getAccount(keypair.publicKey());
    const tx = this.buildUnsigned(account, request, validForSeconds);

    const simulation = await this.client.rpc.simulateTransaction(tx);
    this.assertSimulationOk(simulation, request);

    const assembled = rpc
      .assembleTransaction(tx, simulation as rpc.Api.SimulateTransactionSuccessResponse)
      .build();
    assembled.sign(keypair);
    return assembled;
  }

  private buildUnsigned(
    account: Account,
    request: InvocationRequest,
    validForSeconds: number
  ): Transaction {
    const contract = new Contract(request.contractId);
    return new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.client.networkPassphrase,
    })
      .addOperation(contract.call(request.method, ...(request.args ?? [])))
      .setTimeout(validForSeconds)
      .build();
  }

  private assertSimulationOk(
    simulation: rpc.Api.SimulateTransactionResponse,
    request: InvocationRequest
  ): void {
    if (rpc.Api.isSimulationError(simulation)) {
      // `debug`, not `error`: the errorHandler already logs the HttpException
      // thrown from here, and some failures are expected (reading the balance
      // of an account without a trustline) and should not clutter the error log.
      logger.debug(
        { method: request.method, contract: request.contractId, error: simulation.error },
        'Soroban simulation failed'
      );
      throw toDomainError(simulation.error, request.kind);
    }
    // The simulation asks to restore archived entries before it can run.
    if (rpc.Api.isSimulationRestore(simulation)) {
      logger.warn(
        { method: request.method, contract: request.contractId },
        'Soroban simulation requires restoring archived state'
      );
      throw toDomainError('archived entries must be restored', request.kind);
    }
  }
}
