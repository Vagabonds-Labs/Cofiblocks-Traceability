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

/** Cuánto vale una transacción preparada antes de que haya que volver a pedirla. */
const DEFAULT_VALIDITY_SECONDS = 5 * 60;

/** Fee base por operación, en stroops. El fee-bump lo termina de cubrir. */
const BASE_FEE = '1000';

export interface InvocationRequest {
  contractId: string;
  method: string;
  args?: xdr.ScVal[];
  /** Contrato al que pertenece el método, para traducir sus códigos de error. */
  kind?: ContractKind;
}

/**
 * Construye, simula y devuelve transacciones listas para firmar.
 *
 * El backend arma la transacción entera, la simula para obtener footprint,
 * entradas de auth y fee, y devuelve el XDR.
 *
 * **El usuario es siempre la source account.** Así el `require_auth` del
 * contrato se resuelve con credenciales `SOURCE_ACCOUNT` y no hay que firmar
 * entradas de autorización por separado.
 */
export class TxBuilder {
  constructor(private readonly client: StellarClient) {}

  /** Lectura: se simula y se devuelve el valor, sin tocar la red de escritura. */
  public async read<T = unknown>(request: InvocationRequest): Promise<T> {
    const tx = this.buildUnsigned(
      // La simulación no valida la secuencia ni exige que la cuenta exista:
      // leer no tiene por qué depender de la clave secreta del backend.
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
   * Escritura que firma el usuario: devuelve el XDR simulado para que la wallet
   * lo firme (SEP-43 `signTransaction`).
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
   * Escritura que firma el backend con su propia cuenta (asignación de roles,
   * vínculo de caficultores). Devuelve la transacción firmada lista para enviar.
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
      // `debug` y no `error`: el errorHandler ya loguea la HttpException que
      // sale de acá, y hay fallos esperables (leer el saldo de una cuenta sin
      // trustline) que no deberían ensuciar el log de errores.
      logger.debug(
        { method: request.method, contract: request.contractId, error: simulation.error },
        'Soroban simulation failed'
      );
      throw toDomainError(simulation.error, request.kind);
    }
    // La simulación pide restaurar entradas archivadas antes de poder ejecutar.
    if (rpc.Api.isSimulationRestore(simulation)) {
      logger.warn(
        { method: request.method, contract: request.contractId },
        'Soroban simulation requires restoring archived state'
      );
      throw toDomainError('archived entries must be restored', request.kind);
    }
  }
}
