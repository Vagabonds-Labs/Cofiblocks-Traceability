import { z } from 'zod';

/** Envelope shared by every VoiceLedger event. */
export const integrationEventSchema = z.object({
  /** VoiceLedger's ID for the event. Retries reuse it; new actions get a new one. */
  event_id: z.string().min(1).max(128),
  type: z.string().min(1).max(64),
  /** When it happened on VoiceLedger's side (ISO 8601). Informational. */
  occurred_at: z.iso.datetime({ offset: true }).optional(),
  data: z.record(z.string(), z.unknown()),
});

export type IntegrationEventEnvelope = z.infer<typeof integrationEventSchema>;

/** `farmer.linked`: a farmer identified themselves in the bot with their cooperative ID. */
export const farmerLinkedSchema = z.object({
  /** Cooperative code, e.g. `KK`. */
  coop_code: z.string().trim().min(1).max(16),
  /** The ID the cooperative gave the farmer, as typed or dictated. */
  farmer_id: z.string().trim().min(1).max(48),
  /** Numeric Telegram user ID. Sent as a string: it does not fit in a JS number safely. */
  telegram_user_id: z
    .union([z.string().regex(/^\d{1,20}$/), z.number().int().positive()])
    .transform((value) => BigInt(value)),
  telegram_username: z.string().max(64).nullish(),
  /** Language the farmer uses in the bot, e.g. `om`, `am`, `en`. */
  language: z.string().min(2).max(8).nullish(),
});

export type FarmerLinkedData = z.infer<typeof farmerLinkedSchema>;
