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

// ── week 2: consent, profile, deliveries ─────────────────────────────────

/** The `farmer_ref` returned by `farmer.linked`, e.g. `KK-ID001`. */
const farmerRefSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z]{1,16}-\S+$/, 'Expected <COOP_CODE>-<farmer ID>, as returned by farmer.linked')
  .transform((value) => value.toUpperCase());

/** Optional evidence of what the farmer said, stored off chain. */
const voiceEvidence = {
  transcript: z.string().max(4000).nullish(),
  audio_ref: z.string().max(512).nullish(),
};

const languageSchema = z.enum(['en', 'om', 'am']);

/** `farmer.consent`: the farmer answered the EUDR consent. */
export const farmerConsentSchema = z.object({
  farmer_ref: farmerRefSchema,
  consent_version: z.string().min(1).max(32),
  language: languageSchema,
  /** The farmer's explicit answer; never a default. */
  accepted: z.boolean(),
  answered_at: z.iso.datetime({ offset: true }),
  declarations: z.record(z.string(), z.boolean()),
  ...voiceEvidence,
});

export type FarmerConsentData = z.infer<typeof farmerConsentSchema>;

const plotSchema = z.object({
  name: z.string().trim().min(1).max(64).nullish(),
  size: z
    .object({
      value: z.number().positive().max(1000),
      unit: z.enum(['fachasa', 'hectare']),
    })
    .nullish(),
  location: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      source: z.enum(['shared', 'typed', 'dictated']),
    })
    .nullish(),
});

export type PlotData = z.infer<typeof plotSchema>;

/** Practice answers: provisional until the final questionnaire is agreed. */
const practiceValue = z.union([
  z.string().max(200),
  z.number(),
  z.boolean(),
  z.array(z.string().max(100)).max(20),
]);

/**
 * `farmer.profile`: additional farm answers or corrections. Omitted fields
 * keep their current values; a supplied `plots` or `practices` replaces the
 * previous one completely.
 */
export const farmerProfileSchema = z
  .object({
    farmer_ref: farmerRefSchema,
    plots: z.array(plotSchema).max(20).optional(),
    practices: z
      .record(z.string().regex(/^[a-z][a-z0-9_]{0,63}$/), practiceValue)
      .refine((value) => Object.keys(value).length <= 50, 'At most 50 practice answers')
      .optional(),
    ...voiceEvidence,
  })
  .refine((value) => value.plots !== undefined || value.practices !== undefined, {
    message: 'Send plots, practices or both',
  });

export type FarmerProfileData = z.infer<typeof farmerProfileSchema>;

/** `delivery.created`: the farmer confirmed a delivery at a collection center. */
export const deliveryCreatedSchema = z.object({
  farmer_ref: farmerRefSchema,
  /** Name of one of the farmer's cooperative's collection centers (case-insensitive). */
  collection_center: z.string().trim().min(1).max(64),
  estimated_kg: z.number().positive().nullish(),
  ripeness: z.string().trim().min(1).max(32).nullish(),
  ...voiceEvidence,
});

export type DeliveryCreatedData = z.infer<typeof deliveryCreatedSchema>;
