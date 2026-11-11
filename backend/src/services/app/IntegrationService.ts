import { createHash } from 'crypto';
import { IntegrationEventStatus, Prisma } from '@prisma/client';

import { HttpException } from '@/exceptions/HttpException';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { farmerLinkedSchema, integrationEventSchema } from '@/schemas/integrationSchemas';
import * as FarmersService from '@/services/app/FarmersService';

const SOURCE = 'voiceledger';

/** A `PROCESSING` event older than this is assumed abandoned (crash) and retried. */
const STALE_PROCESSING_MS = 2 * 60 * 1000;

/** Events defined in the integration contract that arrive in week 2. */
const UPCOMING_EVENTS = new Set(['farmer.consent', 'farmer.profile', 'delivery.created']);

export interface IntegrationResponse {
  status: number;
  body: Record<string, unknown>;
}

type Handler = (data: Record<string, unknown>) => Promise<Record<string, unknown>>;

/**
 * Event handlers. A `Map`, not an object literal: looking up an arbitrary
 * `type` in a plain object also finds inherited members (`toString`,
 * `constructor`…), which would run as if they were handlers.
 */
const HANDLERS = new Map<string, Handler>([
  ['farmer.linked', async (data) => {
    const parsed = farmerLinkedSchema.safeParse(data);
    if (!parsed.success) {
      throw new HttpException(400, 'Invalid farmer.linked data', 'INVALID_PAYLOAD', parsed.error.issues);
    }
    const result = await FarmersService.linkFarmerFromIntegration({
      coopCode: parsed.data.coop_code,
      farmerId: parsed.data.farmer_id,
      telegramUserId: parsed.data.telegram_user_id,
      telegramUsername: parsed.data.telegram_username,
      language: parsed.data.language,
    });
    return { ...result };
  }],
]);

/** JSON with sorted keys, so the same content always serializes the same way. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

/**
 * Fingerprint of what an event asks for: its type and data. A retry may
 * re-serialize the JSON or refresh `occurred_at`; it is still the same event.
 */
function contentHash(type: string, data: Record<string, unknown>): string {
  return createHash('sha256').update(canonicalJson({ type, data })).digest('hex');
}

function failure(eventId: string | null, type: string | null, status: number, code: string, message: string, details?: unknown): IntegrationResponse {
  return {
    status,
    body: {
      event_id: eventId,
      type,
      status: 'failed',
      error: { code, message, ...(details !== undefined && { details }) },
    },
  };
}

function processing(eventId: string, type: string): IntegrationResponse {
  return { status: 202, body: { event_id: eventId, type, status: 'processing' } };
}

/** The stored answer for an event, replayed on retries and status checks. */
function stored(event: { eventId: string; type: string; status: IntegrationEventStatus; httpStatus: number | null; response: Prisma.JsonValue }): IntegrationResponse {
  if (event.status === IntegrationEventStatus.PROCESSING || event.httpStatus === null) {
    return processing(event.eventId, event.type);
  }
  return { status: event.httpStatus, body: event.response as Record<string, unknown> };
}

/**
 * Takes ownership of an event before processing it.
 *
 * - New `event_id`: it is stored as `PROCESSING` and processed.
 * - Same `event_id` with the same type and data: the stored answer is replayed. Transient
 *   failures (5xx) and abandoned `PROCESSING` rows are processed again;
 *   everything they do is idempotent.
 * - Same `event_id` with a different type or data: rejected.
 */
async function claim(eventId: string, type: string, payloadHash: string, payload: Prisma.InputJsonValue):
  Promise<{ kind: 'process'; id: string } | { kind: 'answer'; response: IntegrationResponse }> {
  try {
    const created = await prisma.integrationEvent.create({
      data: { source: SOURCE, eventId, type, payloadHash, payload },
    });
    return { kind: 'process', id: created.id };
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) throw error;
  }

  const existing = await prisma.integrationEvent.findUniqueOrThrow({
    where: { source_eventId: { source: SOURCE, eventId } },
  });
  if (existing.payloadHash !== payloadHash) {
    return {
      kind: 'answer',
      response: failure(eventId, type, 409, 'EVENT_ID_REUSED', 'This event_id was already used for a different event'),
    };
  }

  const retryable =
    (existing.status === IntegrationEventStatus.FAILED && (existing.httpStatus ?? 500) >= 500) ||
    (existing.status === IntegrationEventStatus.PROCESSING &&
      Date.now() - existing.updatedAt.getTime() > STALE_PROCESSING_MS);
  if (!retryable) return { kind: 'answer', response: stored(existing) };

  // Optimistic lock: only one concurrent retry takes it.
  const { count } = await prisma.integrationEvent.updateMany({
    where: { id: existing.id, status: existing.status, updatedAt: existing.updatedAt },
    data: { status: IntegrationEventStatus.PROCESSING, httpStatus: null, response: Prisma.DbNull, errorCode: null },
  });
  return count === 1 ? { kind: 'process', id: existing.id } : { kind: 'answer', response: processing(eventId, type) };
}

/** Handles one signed message from VoiceLedger (`POST /api/integrations/voiceledger/events`). */
export async function receiveVoiceLedgerEvent(payload: unknown): Promise<IntegrationResponse> {
  const envelope = integrationEventSchema.safeParse(payload);
  if (!envelope.success) {
    return failure(null, null, 400, 'INVALID_PAYLOAD', 'Invalid event envelope', envelope.error.issues);
  }
  const { event_id: eventId, type, data } = envelope.data;

  const claimed = await claim(eventId, type, contentHash(type, data), payload as Prisma.InputJsonValue);
  if (claimed.kind === 'answer') return claimed.response;

  let response: IntegrationResponse;
  let txHash: string | null = null;
  try {
    const handler = HANDLERS.get(type);
    if (!handler) {
      throw UPCOMING_EVENTS.has(type)
        ? new HttpException(422, `${type} is not supported yet`, 'UNSUPPORTED_EVENT')
        : new HttpException(422, `Unknown event type ${type}`, 'UNKNOWN_EVENT_TYPE');
    }
    const result = await handler(data);
    txHash = typeof result.tx_hash === 'string' ? result.tx_hash : null;
    response = { status: 200, body: { event_id: eventId, type, status: 'succeeded', result } };
  } catch (error) {
    if (error instanceof HttpException) {
      response = failure(eventId, type, error.statusCode, error.code ?? 'ERROR', error.message, error.details);
    } else {
      logger.error({ error, eventId, type }, 'VoiceLedger event failed');
      response = failure(eventId, type, 500, 'INTERNAL_ERROR', 'The event could not be processed. Retry it later.');
    }
  }

  const succeeded = response.status < 300;
  await prisma.integrationEvent.update({
    where: { id: claimed.id },
    data: {
      status: succeeded ? IntegrationEventStatus.SUCCEEDED : IntegrationEventStatus.FAILED,
      httpStatus: response.status,
      response: response.body as Prisma.InputJsonValue,
      txHash,
      errorCode: succeeded ? null : String((response.body.error as { code: string }).code),
    },
  });
  return response;
}

/** Current answer for an event (`GET /api/integrations/voiceledger/events/:eventId`). */
export async function getVoiceLedgerEvent(eventId: string): Promise<IntegrationResponse> {
  const event = await prisma.integrationEvent.findUnique({
    where: { source_eventId: { source: SOURCE, eventId } },
  });
  if (!event) return failure(eventId, null, 404, 'EVENT_NOT_FOUND', 'No event with this event_id');
  return stored(event);
}
