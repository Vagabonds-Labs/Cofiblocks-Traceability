import { rpc, scValToNative, StrKey, xdr } from '@stellar/stellar-sdk';

import { HttpException } from '@/exceptions/HttpException';
import { logger } from '@/lib/logger';
import { StellarClient } from './StellarClient';
import { ROLE_BY_DISCRIMINANT, STAGE_BY_DISCRIMINANT } from './types/contracts';
import {
  BatchCreatedEvent,
  ConsentRecordedEvent,
  FarmerRegisteredEvent,
  RawEvent,
  RoleGrantedEvent,
  StageAdvancedEvent,
} from './types/events';
import { bytesToHex } from './utils/formatting';

/** Un evento de contrato ya traducido a tipos de JS. */
interface DecodedEvent {
  contractId: string;
  /** Primer topic: el nombre legible del evento. */
  name: string;
  /** Topics restantes, ya nativos. */
  keys: unknown[];
  /** Sección de datos: un mapa indexado por nombre de campo. */
  data: Record<string, unknown>;
}

/** `bigint | number | string` → `string`, que es lo que compara el backend. */
function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'bigint' ? value.toString() : String(value);
}

/**
 * Eventos del contrato `traceability` de una transacción.
 *
 * Cada `parse*` devuelve todos los eventos de ese tipo (normalmente uno). El
 * backend los usa para verificar que la transacción hizo lo que pidió, en vez
 * de confiar en lo que reporte el cliente.
 */
export class EventsParser {
  constructor(
    private readonly events: DecodedEvent[],
    private readonly isError: boolean = false
  ) {}

  public getEvents(): RawEvent[] {
    return this.events.map((event) => ({
      contractId: event.contractId,
      name: event.name,
      topics: event.keys,
      data: event.data,
    }));
  }

  public getIsError(): boolean {
    return this.isError;
  }

  private byName(name: string): DecodedEvent[] {
    return this.events.filter((event) => event.name === name);
  }

  public parseRoleGranted(): RoleGrantedEvent[] {
    return this.byName('role_granted').map((event) => ({
      account: str(event.keys[0]),
      role: ROLE_BY_DISCRIMINANT[Number(event.data.role)],
      org: Number(event.data.org),
    }));
  }

  public parseRoleRevoked(): { account: string }[] {
    return this.byName('role_revoked').map((event) => ({ account: str(event.keys[0]) }));
  }

  public parseFarmerRegistered(): FarmerRegisteredEvent[] {
    return this.byName('farmer_registered').map((event) => ({
      account: str(event.keys[0]),
      farmer_ref: str(event.data.farmer_ref),
      coop: Number(event.data.coop),
    }));
  }

  public parseConsentRecorded(): ConsentRecordedEvent[] {
    return this.byName('consent_recorded').map((event) => ({
      account: str(event.keys[0]),
      consent_hash: bytesToHex(event.data.consent_hash),
    }));
  }

  public parseBatchCreated(): BatchCreatedEvent[] {
    return this.byName('batch_created').map((event) => ({
      id: str(event.keys[0]),
      farmer_ref: str(event.data.farmer_ref),
      coop: Number(event.data.coop),
      collection_center: Number(event.data.collection_center),
      weight_grams: str(event.data.weight_grams),
      actor: str(event.data.actor),
      data_hash: bytesToHex(event.data.data_hash),
    }));
  }

  public parseStageAdvanced(): StageAdvancedEvent[] {
    return this.byName('stage_advanced').map((event) => ({
      id: str(event.keys[0]),
      stage: STAGE_BY_DISCRIMINANT[Number(event.data.stage)],
      actor: str(event.data.actor),
      data_hash: bytesToHex(event.data.data_hash),
    }));
  }
}

/**
 * Lee los eventos que emitió una transacción.
 *
 * En Soroban los topics son símbolos legibles y la sección de datos es un mapa
 * indexado por nombre de campo.
 *
 * **Retención:** el RPC de Soroban guarda los eventos alrededor de 7 días y las
 * transacciones bastante menos. La verificación inmediata que hace el backend
 * sigue funcionando, pero el historial de largo plazo vive en Postgres y en
 * `get_batch` del contrato.
 */
export class EventsClient {
  private readonly client: StellarClient;

  constructor(client?: StellarClient) {
    this.client = client ?? new StellarClient();
  }

  public async getTransactionEvents(txHash: string): Promise<EventsParser> {
    let result: rpc.Api.GetTransactionResponse;
    try {
      result = await this.client.rpc.getTransaction(txHash);
    } catch (error) {
      logger.error({ error, txHash }, 'Could not fetch transaction from Soroban RPC');
      throw new HttpException(400, 'Transaction not found', 'TRANSACTION_NOT_FOUND');
    }

    if (result.status === rpc.Api.GetTransactionStatus.NOT_FOUND) {
      throw new HttpException(400, 'Transaction not found', 'TRANSACTION_NOT_FOUND');
    }
    if (result.status === rpc.Api.GetTransactionStatus.FAILED) {
      return new EventsParser([], true);
    }

    return new EventsParser(decodeContractEvents(result));
  }
}

/** El contractId llega como wrapper con bytes o ya como StrKey. */
function toContractId(raw: unknown): string {
  if (typeof raw === 'string') return raw;
  const value = (raw as { value?: Uint8Array })?.value;
  return value ? StrKey.encodeContract(Buffer.from(value)) : '';
}

function decodeContractEvents(result: rpc.Api.GetSuccessfulTransactionResponse): DecodedEvent[] {
  const raw = result.events?.contractEventsXdr;
  if (!raw) {
    return [];
  }

  const decoded: DecodedEvent[] = [];
  for (const event of raw.flat()) {
    try {
      const body = (event as unknown as { body: { v0: { topics: xdr.ScVal[]; data: xdr.ScVal } } })
        .body.v0;
      const topics = body.topics.map((topic) => scValToNative(topic));
      const data = scValToNative(body.data);
      decoded.push({
        contractId: toContractId((event as unknown as { contractId: unknown }).contractId),
        name: str(topics[0]),
        keys: topics.slice(1),
        data: (data ?? {}) as Record<string, unknown>,
      });
    } catch (error) {
      // Un evento que no sabemos leer (por ejemplo del SAC) no debe tumbar el parseo.
      logger.debug({ error }, 'Skipping unparseable contract event');
    }
  }
  return decoded;
}
