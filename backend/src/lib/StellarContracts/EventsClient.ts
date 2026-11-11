import { rpc, scValToNative, StrKey, xdr } from '@stellar/stellar-sdk';

import { HttpException } from '@/exceptions/HttpException';
import { logger } from '@/lib/logger';
import { StellarClient } from './StellarClient';
import { ROLE_BY_DISCRIMINANT, STAGE_BY_DISCRIMINANT } from './types/contracts';
import {
  BatchCreatedEvent,
  ConsentRecordedEvent,
  DocumentAttachedEvent,
  FarmerAgentSetEvent,
  FarmerRegisteredEvent,
  ProfileUpdatedEvent,
  RawEvent,
  ReceptionRecordedEvent,
  RoleGrantedEvent,
  StageAdvancedEvent,
} from './types/events';
import { bytesToHex } from './utils/formatting';

/** A contract event already converted to JS types. */
interface DecodedEvent {
  contractId: string;
  /** First topic: the event's readable name. */
  name: string;
  /** Remaining topics, already converted to native values. */
  keys: unknown[];
  /** Data section: a map keyed by field name. */
  data: Record<string, unknown>;
}

/** `bigint | number | string` → `string`, which is what the backend compares. */
function str(value: unknown): string {
  if (value === null || value === undefined) return '';
  return typeof value === 'bigint' ? value.toString() : String(value);
}

/**
 * `traceability` contract events in a transaction.
 *
 * Each `parse*` returns every event of that type (usually one). The backend
 * uses them to verify that the transaction did what was requested, instead of
 * trusting what the client reports.
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

  public parseFarmerAgentSet(): FarmerAgentSetEvent[] {
    return this.byName('farmer_agent_set').map((event) => ({ agent: str(event.keys[0]) }));
  }

  public parseFarmerRegistered(): FarmerRegisteredEvent[] {
    return this.byName('farmer_registered').map((event) => ({
      farmer_ref: str(event.keys[0]),
      coop: Number(event.data.coop),
    }));
  }

  public parseConsentRecorded(): ConsentRecordedEvent[] {
    return this.byName('consent_recorded').map((event) => ({
      farmer_ref: str(event.keys[0]),
      consent_hash: bytesToHex(event.data.consent_hash),
    }));
  }

  public parseProfileUpdated(): ProfileUpdatedEvent[] {
    return this.byName('profile_updated').map((event) => ({
      farmer_ref: str(event.keys[0]),
      profile_hash: bytesToHex(event.data.profile_hash),
    }));
  }

  public parseBatchCreated(): BatchCreatedEvent[] {
    return this.byName('batch_created').map((event) => ({
      id: str(event.keys[0]),
      farmer_ref: str(event.data.farmer_ref),
      coop: Number(event.data.coop),
      collection_center: Number(event.data.collection_center),
      data_hash: bytesToHex(event.data.data_hash),
    }));
  }

  public parseReceptionRecorded(): ReceptionRecordedEvent[] {
    return this.byName('reception_recorded').map((event) => ({
      id: str(event.keys[0]),
      collector: str(event.data.collector),
      weight_grams: str(event.data.weight_grams),
      receipt_hash: bytesToHex(event.data.receipt_hash),
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

  public parseDocumentAttached(): DocumentAttachedEvent[] {
    return this.byName('document_attached').map((event) => ({
      id: str(event.keys[0]),
      actor: str(event.data.actor),
      doc_hash: bytesToHex(event.data.doc_hash),
    }));
  }
}

/**
 * Reads the events emitted by a transaction.
 *
 * In Soroban the topics are readable symbols and the data section is a map
 * keyed by field name.
 *
 * **Retention:** the Soroban RPC keeps events for about 7 days and
 * transactions for much less. The backend's immediate verification still
 * works, but the long-term history lives in Postgres and in the contract's
 * `get_batch`.
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

/** The contractId arrives either as a wrapper with bytes or already as a StrKey. */
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
      // An event we cannot read (for example from the SAC) must not break parsing.
      logger.debug({ error }, 'Skipping unparseable contract event');
    }
  }
  return decoded;
}
