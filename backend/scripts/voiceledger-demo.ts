/**
 * VoiceLedger simulator: runs a farmer's whole journey through the signed
 * integration API, exactly as VoiceLedger's bot would, and prints the Stellar
 * Expert link of every on-chain step.
 *
 *   npm run voiceledger:demo -- KK ID001 [--center Kirkir] [--kg 45] [--telegram 123456789]
 *
 * Steps: farmer.linked → farmer.consent → farmer.profile → delivery.created,
 * then the delivery is sent again with the same event_id to show it is
 * recorded only once. The farmer must be on the cooperative's list.
 *
 * Uses VOICELEDGER_WEBHOOK_SECRET from .env and API_URL (default
 * http://localhost:4000). For the full SOW evidence (collector and rejected
 * attempts too) use `npm run sow:evidence`.
 */
import { farmerJourney, sendOk } from './lib/voiceledger';

function option(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index === -1 ? fallback : process.argv[index + 1];
}

function step(label: string, result: Record<string, unknown>, extra = '') {
  console.log(`✓ ${label}${extra ? ` — ${extra}` : ''}`);
  if (result.explorer_url) console.log(`  ${result.explorer_url}`);
}

async function main() {
  const [coopCode, farmerId] = process.argv.slice(2).filter((arg, i, all) => !arg.startsWith('--') && !all[i - 1]?.startsWith('--'));
  if (!coopCode || !farmerId) {
    console.error('Usage: npm run voiceledger:demo -- <COOP_CODE> <FARMER_ID> [--center <name>] [--kg <n>] [--telegram <id>]');
    process.exit(1);
  }
  const telegramIndex = process.argv.indexOf('--telegram');
  const journey = await farmerJourney({
    coopCode,
    farmerId,
    center: option('--center', 'Kirkir'),
    kg: Number(option('--kg', '45')),
    telegram: telegramIndex === -1 ? undefined : process.argv[telegramIndex + 1],
  });

  step('1. Farmer linked and registered on chain', journey.linked.result, journey.farmerRef);
  step('2. EUDR consent recorded', journey.consent.result, `hash ${String(journey.consent.result.consent_hash).slice(0, 12)}…`);
  step('3. Farm profile recorded', journey.profile.result, `version ${journey.profile.result.profile_version}`);
  step('4. Delivery recorded: a farmer creates a batch', journey.delivery.result, String(journey.delivery.result.batch_id));

  const retry = await sendOk('delivery.created', journey.deliveryData, journey.delivery.eventId);
  const same = retry.result.tx_hash === journey.delivery.result.tx_hash;
  console.log(`${same ? '✓' : '✗'} 5. Same event_id sent again: ${same ? 'same batch and transaction, nothing new on chain' : 'DIFFERENT result'}`);
  if (!same) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
