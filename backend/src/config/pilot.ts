/**
 * Pilot settings that are still being confirmed with the cooperatives.
 *
 * Each one has a working default so the integration can be built and tested
 * now; the open questions are listed in `docs/implementation-plan.md` §4.
 */

/** Ethiopia's time zone. Batch numbers use the local delivery date. */
export const PILOT_TIME_ZONE = 'Africa/Addis_Ababa';

// ── EUDR consent ──────────────────────────────────────────────────────────

/** Declarations the farmer has to confirm, in this order. */
export const CONSENT_DECLARATIONS = [
  'data_processing',
  'no_deforestation_since_2020_12_31',
  'information_is_accurate',
] as const;

export type ConsentDeclaration = (typeof CONSENT_DECLARATIONS)[number];

export interface ConsentVersion {
  declarations: readonly ConsentDeclaration[];
  /** The texts the bot shows, per language. A version's texts never change. */
  texts: Partial<Record<'en' | 'om' | 'am', { intro: string } & Record<ConsentDeclaration, string>>>;
}

/**
 * Consent texts by version. The bot shows one version and sends its ID back
 * with the answer; the hash written on chain covers that ID, so the text a
 * farmer accepted can always be found here. To change a text, add a version.
 *
 * Draft, pending review by Karla and WHH. The Afaan Oromoo and Amharic
 * versions are still to be translated by a native speaker.
 */
export const CONSENT_VERSIONS: Record<string, ConsentVersion> = {
  '2026-11-v1': {
    declarations: CONSENT_DECLARATIONS,
    texts: {
      en: {
        intro:
          'CofiBlocks records your coffee deliveries for your cooperative. Your name, phone and farm location stay private with your cooperative and CofiBlocks. Only your cooperative ID and your deliveries are recorded on a public blockchain, without your name.',
        data_processing:
          'I agree that my cooperative and CofiBlocks store and use my farm and delivery information for traceability and EU export requirements.',
        no_deforestation_since_2020_12_31:
          'I declare that no forest was cleared on my coffee plots after 31 December 2020.',
        information_is_accurate: 'I declare that the information I give is true.',
      },
    },
  },
};

// ── farm area ─────────────────────────────────────────────────────────────

/**
 * Hectares per unit of area. `fachasa` is unknown until the cooperatives
 * confirm it: set `FACHASA_TO_HECTARES` and conversions start; until then the
 * original value and unit are kept and hectares stay empty.
 */
export function hectaresPerUnit(unit: string): number | null {
  if (unit === 'hectare') return 1;
  if (unit === 'fachasa') {
    const factor = Number(process.env.FACHASA_TO_HECTARES);
    return Number.isFinite(factor) && factor > 0 ? factor : null;
  }
  return null;
}

/** Units the bot may send for a plot's area. */
export const AREA_UNITS = ['fachasa', 'hectare'] as const;

// ── farm location ─────────────────────────────────────────────────────────

export interface BoundingBox {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

/**
 * Plots must fall inside this box. The default is a generous box around Gomma
 * woreda (Jimma zone); `FARM_AREA_BBOX="minLat,minLng,maxLat,maxLng"`
 * overrides it. Its purpose is catching mistyped or misheard coordinates,
 * not tracing the woreda's border.
 */
export function farmArea(): BoundingBox {
  const raw = process.env.FARM_AREA_BBOX;
  if (raw) {
    const [minLat, minLng, maxLat, maxLng] = raw.split(',').map((v) => Number(v.trim()));
    if ([minLat, minLng, maxLat, maxLng].every(Number.isFinite) && minLat < maxLat && minLng < maxLng) {
      return { minLat, minLng, maxLat, maxLng };
    }
    throw new Error('FARM_AREA_BBOX must be "minLat,minLng,maxLat,maxLng"');
  }
  return { minLat: 7.55, minLng: 36.3, maxLat: 8.2, maxLng: 37.0 };
}

export function isInFarmArea(lat: number, lng: number): boolean {
  const box = farmArea();
  return lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;
}

// ── deliveries ────────────────────────────────────────────────────────────

/** Largest delivery the bot may report, in kg (catches misheard numbers). */
export const MAX_ESTIMATED_KG = 2000;

/** How far back a delivery's `occurred_at` may be (bot offline, retries). */
export const MAX_DELIVERY_AGE_DAYS = 14;
