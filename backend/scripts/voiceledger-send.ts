/**
 * Sends a signed event to the backend, exactly as VoiceLedger's bot would.
 * Useful for testing the integration and for demos before the bot is ready.
 *
 *   npm run voiceledger:send -- farmer.linked '{"coop_code":"KK","farmer_id":"ID001","telegram_user_id":"123456789"}'
 *   npm run voiceledger:send -- farmer.linked '<data>' --event-id my-id   # retry an event
 *   npm run voiceledger:send -- --status my-id                           # check an event
 *
 * Uses VOICELEDGER_WEBHOOK_SECRET from .env and API_URL (default
 * http://localhost:4000).
 */
import 'dotenv/config';
import { randomUUID } from 'crypto';

import { signVoiceLedgerPayload } from '@/middleware/voiceLedgerSignature';

function option(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main() {
  const secret = process.env.VOICELEDGER_WEBHOOK_SECRET;
  if (!secret) throw new Error('VOICELEDGER_WEBHOOK_SECRET is not set');
  const api = process.env.API_URL || 'http://localhost:4000';
  const timestamp = String(Math.floor(Date.now() / 1000));

  const statusId = option('--status');
  if (statusId) {
    const path = `/api/integrations/voiceledger/events/${encodeURIComponent(statusId)}`;
    const res = await fetch(`${api}${path}`, {
      headers: {
        'X-VoiceLedger-Timestamp': timestamp,
        'X-VoiceLedger-Signature': signVoiceLedgerPayload(secret, timestamp, 'GET', path, ''),
      },
    });
    console.log(res.status, JSON.stringify(await res.json(), null, 2));
    return;
  }

  const [type, data] = process.argv.slice(2).filter((arg, i, all) => !arg.startsWith('--') && !all[i - 1]?.startsWith('--'));
  if (!type || !data) {
    console.error("Usage: npm run voiceledger:send -- <type> '<data JSON>' [--event-id <id>]");
    process.exit(1);
  }
  const body = JSON.stringify({
    event_id: option('--event-id') ?? randomUUID(),
    type,
    occurred_at: new Date().toISOString(),
    data: JSON.parse(data),
  });
  const path = '/api/integrations/voiceledger/events';
  const res = await fetch(`${api}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-VoiceLedger-Timestamp': timestamp,
      'X-VoiceLedger-Signature': signVoiceLedgerPayload(secret, timestamp, 'POST', path, body),
    },
    body,
  });
  console.log(res.status, JSON.stringify(await res.json(), null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
