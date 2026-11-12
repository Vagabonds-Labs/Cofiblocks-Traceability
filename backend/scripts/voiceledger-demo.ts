/**
 * VoiceLedger simulator: runs a farmer's whole journey through the signed
 * integration API, exactly as VoiceLedger's bot would, and prints the Stellar
 * Expert link of every on-chain step. It produces the SOW proof "a farmer
 * creates a batch" without depending on VoiceLedger's bot.
 *
 *   npm run voiceledger:demo -- KK ID001 [--center Kirkir] [--kg 45] [--telegram 123456789]
 *
 * Steps: farmer.linked → farmer.consent → farmer.profile → delivery.created,
 * then the delivery is sent again with the same event_id to show it is
 * recorded only once. The farmer must be on the cooperative's list.
 *
 * Uses VOICELEDGER_WEBHOOK_SECRET from .env and API_URL (default
 * http://localhost:4000).
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';

import { signVoiceLedgerPayload } from '@/middleware/voiceLedgerSignature';

const PATH = '/api/integrations/voiceledger/events';

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function send(type: string, data: Record<string, unknown>, eventId = randomUUID()) {
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
  const json = (await res.json()) as { status: string; result?: Record<string, unknown>; error?: unknown };
  if (res.status !== 200) {
    console.error(`✗ ${type} → ${res.status}`, JSON.stringify(json.error, null, 2));
    process.exit(1);
  }
  return { eventId, result: json.result! };
}

function step(label: string, result: Record<string, unknown>, extra = '') {
  console.log(`✓ ${label}${extra ? ` — ${extra}` : ''}`);
  if (result.explorer_url) console.log(`  ${result.explorer_url}`);
}

async function main() {
  const [coopCode, farmerId] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  if (!coopCode || !farmerId) {
    console.error('Usage: npm run voiceledger:demo -- <COOP_CODE> <FARMER_ID> [--center <name>] [--kg <n>] [--telegram <id>]');
    process.exit(1);
  }
  const center = option('--center', 'Kirkir');
  const kg = Number(option('--kg', '45'));
  const telegram = option('--telegram', String(900_000_000 + Math.floor(Math.random() * 99_999_999)));

  const linked = await send('farmer.linked', {
    coop_code: coopCode,
    farmer_id: farmerId,
    telegram_user_id: telegram,
    language: 'om',
  });
  const farmerRef = String(linked.result.farmer_ref);
  step('1. Farmer linked and registered on chain', linked.result, farmerRef);

  const consent = await send('farmer.consent', {
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
  step('2. EUDR consent recorded', consent.result, `hash ${String(consent.result.consent_hash).slice(0, 12)}…`);

  const profile = await send('farmer.profile', {
    farmer_ref: farmerRef,
    plots: [{ name: 'Plot 1', size: { value: 1.5, unit: 'fachasa' }, location: { lat: 7.86, lng: 36.62, source: 'shared' } }],
    practices: { shade_trees: true, fertilizer: 'compost' },
  });
  step('3. Farm profile recorded', profile.result, `version ${profile.result.profile_version}`);

  const deliveryData = { farmer_ref: farmerRef, collection_center: center, estimated_kg: kg, ripeness: 'ripe' };
  const delivery = await send('delivery.created', deliveryData);
  step('4. Delivery recorded: a farmer creates a batch', delivery.result, String(delivery.result.batch_id));

  const retry = await send('delivery.created', deliveryData, delivery.eventId);
  const same = retry.result.tx_hash === delivery.result.tx_hash;
  console.log(`${same ? '✓' : '✗'} 5. Same event_id sent again: ${same ? 'same batch and transaction, nothing new on chain' : 'DIFFERENT result'}`);
  if (!same) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
