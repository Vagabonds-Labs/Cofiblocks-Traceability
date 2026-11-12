/**
 * Signed client for our VoiceLedger integration API, exactly as VoiceLedger's
 * bot calls it. Shared by the simulator scripts.
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';

import { signVoiceLedgerPayload } from '@/middleware/voiceLedgerSignature';

const PATH = '/api/integrations/voiceledger/events';

export interface EventResponse {
  status: number;
  eventId: string;
  body: { status: string; result?: Record<string, unknown>; error?: { code: string; message: string; details?: unknown } };
}

/** Sends one event and returns the HTTP status and body, whatever they are. */
export async function sendEvent(type: string, data: Record<string, unknown>, eventId: string = randomUUID()): Promise<EventResponse> {
  const secret = process.env.VOICELEDGER_WEBHOOK_SECRET;
  if (!secret) throw new Error('VOICELEDGER_WEBHOOK_SECRET is not set');
  const api = process.env.API_URL || 'http://localhost:4000';
  const body = JSON.stringify({ event_id: eventId, type, occurred_at: new Date().toISOString(), data });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const res = await fetch(`${api}${PATH}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-VoiceLedger-Timestamp': timestamp,
      'X-VoiceLedger-Signature': signVoiceLedgerPayload(secret, timestamp, 'POST', PATH, body),
    },
    body,
  });
  return { status: res.status, eventId, body: (await res.json()) as EventResponse['body'] };
}

/** Sends one event that must succeed; exits with the error otherwise. */
export async function sendOk(type: string, data: Record<string, unknown>, eventId?: string) {
  const response = await sendEvent(type, data, eventId);
  if (response.status !== 200) {
    console.error(`✗ ${type} → ${response.status}`, JSON.stringify(response.body.error, null, 2));
    process.exit(1);
  }
  return { eventId: response.eventId, result: response.body.result! };
}

/** The farmer's journey up to a delivery. Returns each step's result. */
export async function farmerJourney(opts: { coopCode: string; farmerId: string; center: string; kg: number; telegram?: string }) {
  const telegram = opts.telegram ?? String(900_000_000 + Math.floor(Math.random() * 99_999_999));
  const linked = await sendOk('farmer.linked', {
    coop_code: opts.coopCode,
    farmer_id: opts.farmerId,
    telegram_user_id: telegram,
    language: 'om',
  });
  const farmerRef = String(linked.result.farmer_ref);
  const consent = await sendOk('farmer.consent', {
    farmer_ref: farmerRef,
    consent_version: '2026-11-v1',
    language: 'om',
    accepted: true,
    answered_at: new Date().toISOString(),
    declarations: {
      data_processing: true,
      no_deforestation_since_2020_12_31: true,
      information_is_accurate: true,
    },
  });
  const profile = await sendOk('farmer.profile', {
    farmer_ref: farmerRef,
    plots: [{ name: 'Plot 1', size: { value: 1.5, unit: 'fachasa' }, location: { lat: 7.86, lng: 36.62, source: 'shared' } }],
    practices: { shade_trees: true, fertilizer: 'compost' },
  });
  const deliveryData = { farmer_ref: farmerRef, collection_center: opts.center, estimated_kg: opts.kg, ripeness: 'ripe' };
  const delivery = await sendOk('delivery.created', deliveryData);
  return { farmerRef, linked, consent, profile, delivery, deliveryData };
}
