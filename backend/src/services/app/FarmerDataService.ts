import { FarmerStatus, Prisma } from '@prisma/client';

import { CONSENT_VERSIONS, hectaresPerUnit, isInFarmArea } from '@/config/pilot';
import { HttpException } from '@/exceptions/HttpException';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { FarmerConsentData, FarmerProfileData, PlotData } from '@/schemas/integrationSchemas';
import { buildFarmerRef } from '@/services/app/FarmersService';
import * as OnChainTraceabilityService from '@/services/onchain/OnChainTraceabilityService';
import { getExplorerBaseURL } from '@/services/onchain/OnChainEnvService';
import { ensureOnChain, transactionPending } from '@/services/onchain/ensureOnChain';
import { sha256Canonical } from '@/utils/canonicalJson';

/** What every farmer event handler receives besides its data. */
export interface IntegrationContext {
  /** `IntegrationEvent.id` of the message being processed. */
  integrationEventId: string;
  /** `occurred_at` of the message, if VoiceLedger sent it. */
  occurredAt: Date | null;
}

export function explorerTxUrl(hash: string): string {
  return `${getExplorerBaseURL()}/tx/${hash}`;
}

export function isUniqueViolation(error: unknown, field?: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  if (!field) return true;
  const target = (error.meta?.target ?? []) as string[] | string;
  return Array.isArray(target) ? target.some((t) => t.includes(field)) : String(target).includes(field);
}

/**
 * Finds the farmer behind a `farmer_ref` (`KK-ID001`). They must be linked
 * and registered on chain: every later farmer action refers to that record.
 */
export async function findRegisteredFarmer(farmerRef: string) {
  const dash = farmerRef.indexOf('-');
  const coopCode = farmerRef.slice(0, dash);
  const coopFarmerId = farmerRef.slice(dash + 1);
  const farmer = await prisma.farmer.findFirst({
    where: { coopFarmerId, organization: { code: coopCode, kind: 'COOPERATIVE' } },
    include: { organization: { include: { collectionCenters: true } } },
  });
  if (!farmer) {
    throw new HttpException(404, `No farmer with farmer_ref ${farmerRef}`, 'FARMER_NOT_FOUND');
  }
  if (!farmer.registeredAt) {
    throw new HttpException(
      409,
      `Farmer ${farmerRef} has not been linked yet. Send farmer.linked first.`,
      'FARMER_NOT_LINKED'
    );
  }
  return { ...farmer, farmerRef: buildFarmerRef(farmer.organization.code, farmer.coopFarmerId) };
}

/** Profile and deliveries need the farmer's consent first (EUDR and data protection). */
export function requireConsent(farmer: { consentAt: Date | null }, farmerRef: string): void {
  if (!farmer.consentAt) {
    throw new HttpException(
      409,
      `Farmer ${farmerRef} has not accepted the consent. Send farmer.consent first.`,
      'CONSENT_REQUIRED'
    );
  }
}

// ── consent ───────────────────────────────────────────────────────────────

export interface ConsentResult {
  farmer_ref: string;
  consent_version: string;
  /** `true` only for an acceptance with every declaration confirmed. */
  consented: boolean;
  consent_hash: string;
  /** `record_consent` transaction; `null` for a refusal (nothing goes on chain). */
  tx_hash: string | null;
  explorer_url: string | null;
}

/**
 * `farmer.consent`. Every answer is stored. An acceptance with every
 * declaration is recorded on chain (`record_consent`) and becomes the
 * farmer's current consent; any other answer clears it, which blocks profile
 * updates and deliveries until the farmer accepts.
 */
export async function recordConsent(ctx: IntegrationContext, data: FarmerConsentData): Promise<ConsentResult> {
  const farmer = await findRegisteredFarmer(data.farmer_ref);
  const { farmerRef } = farmer;

  const version = CONSENT_VERSIONS[data.consent_version];
  if (!version) {
    throw new HttpException(
      422,
      `Unknown consent_version ${data.consent_version}`,
      'UNKNOWN_CONSENT_VERSION',
      { known: Object.keys(CONSENT_VERSIONS) }
    );
  }
  const sent = Object.keys(data.declarations).sort();
  const expected = [...version.declarations].sort();
  if (sent.length !== expected.length || sent.some((key, i) => key !== expected[i])) {
    throw new HttpException(400, 'declarations must contain exactly the declarations of this version', 'INVALID_DECLARATIONS', {
      expected: version.declarations,
    });
  }

  const consented = data.accepted && version.declarations.every((key) => data.declarations[key] === true);
  const answeredAt = new Date(data.answered_at);
  // What the hash covers: the farmer, the version of the text and their answers.
  const record = {
    farmer_ref: farmerRef,
    consent_version: data.consent_version,
    language: data.language,
    accepted: data.accepted,
    declarations: data.declarations,
    answered_at: answeredAt.toISOString(),
  };
  const consentHash = sha256Canonical(record);

  let row = await prisma.farmerConsent.findUnique({ where: { integrationEventId: ctx.integrationEventId } });
  if (!row) {
    try {
      row = await prisma.farmerConsent.create({
        data: {
          farmerId: farmer.id,
          integrationEventId: ctx.integrationEventId,
          consentVersion: data.consent_version,
          language: data.language,
          accepted: data.accepted,
          declarations: data.declarations,
          answeredAt,
          transcript: data.transcript ?? null,
          audioRef: data.audio_ref ?? null,
          consentHash,
        },
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      row = await prisma.farmerConsent.findUniqueOrThrow({ where: { integrationEventId: ctx.integrationEventId } });
    }
  }

  if (!consented) {
    // A later refusal withdraws an earlier acceptance (off chain; the
    // on-chain history keeps the acceptance and its date).
    await prisma.farmer.updateMany({
      where: { id: farmer.id, OR: [{ consentAt: null }, { consentAt: { lte: answeredAt } }] },
      data: { consentHash: null, consentTx: null, consentAt: null, consentVersion: null },
    });
    await prisma.farmer.updateMany({
      where: { id: farmer.id, status: FarmerStatus.CONSENTED },
      data: { status: FarmerStatus.LINKED },
    });
    logger.info({ farmerRef, consentVersion: data.consent_version }, 'Farmer did not give consent');
    return {
      farmer_ref: farmerRef,
      consent_version: data.consent_version,
      consented: false,
      consent_hash: row.consentHash,
      tx_hash: null,
      explorer_url: null,
    };
  }

  const consentRow = row;
  const txHash = await ensureOnChain({
    label: `record_consent ${farmerRef}`,
    state: { tx: consentRow.tx, txValidUntil: consentRow.txValidUntil, confirmedAt: consentRow.confirmedAt },
    build: OnChainTraceabilityService.build.recordConsent(farmerRef, consentRow.consentHash),
    claim: async (previous, hash, validUntil) => {
      const { count } = await prisma.farmerConsent.updateMany({
        where: { id: consentRow.id, confirmedAt: null, tx: previous },
        data: { tx: hash, txValidUntil: validUntil },
      });
      return count === 1;
    },
    release: async (hash) => {
      await prisma.farmerConsent.updateMany({
        where: { id: consentRow.id, tx: hash, confirmedAt: null },
        data: { tx: null, txValidUntil: null },
      });
    },
    confirm: async (hash) => {
      await OnChainTraceabilityService.verifyConsentRecorded(hash, farmerRef, consentRow.consentHash);
      await prisma.$transaction([
        prisma.farmerConsent.update({
          where: { id: consentRow.id },
          data: { tx: hash, confirmedAt: new Date(), txValidUntil: null },
        }),
        // Becomes the current consent unless a newer answer already is.
        prisma.farmer.updateMany({
          where: { id: farmer.id, OR: [{ consentAt: null }, { consentAt: { lte: consentRow.answeredAt } }] },
          data: {
            consentHash: consentRow.consentHash,
            consentTx: hash,
            consentAt: consentRow.answeredAt,
            consentVersion: consentRow.consentVersion,
          },
        }),
        prisma.farmer.updateMany({
          where: { id: farmer.id, status: { in: [FarmerStatus.PRELOADED, FarmerStatus.LINKED] } },
          data: { status: FarmerStatus.CONSENTED },
        }),
      ]);
    },
    pending: transactionPending,
  });

  logger.info({ farmerRef, txHash }, 'Recorded farmer consent');
  return {
    farmer_ref: farmerRef,
    consent_version: consentRow.consentVersion,
    consented: true,
    consent_hash: consentRow.consentHash,
    tx_hash: txHash,
    explorer_url: explorerTxUrl(txHash),
  };
}

// ── farm profile ──────────────────────────────────────────────────────────

/** A plot as stored in the profile (and hashed). */
interface StoredPlot {
  name: string | null;
  size: { value: number; unit: string } | null;
  location: { lat: number; lng: number; source: string } | null;
}

/** The complete profile of one version. Its canonical JSON is what is hashed. */
interface StoredProfile {
  farmer_ref: string;
  version: number;
  plots: StoredPlot[];
  practices: Record<string, unknown>;
}

function toStoredPlot(plot: PlotData): StoredPlot {
  return {
    name: plot.name ?? null,
    size: plot.size ? { value: plot.size.value, unit: plot.size.unit } : null,
    location: plot.location
      ? { lat: plot.location.lat, lng: plot.location.lng, source: plot.location.source }
      : null,
  };
}

function hectaresOf(plot: StoredPlot): number | null {
  if (!plot.size) return null;
  const factor = hectaresPerUnit(plot.size.unit);
  return factor === null ? null : Math.round(plot.size.value * factor * 10_000) / 10_000;
}

export interface ProfileResult {
  farmer_ref: string;
  profile_version: number;
  profile_hash: string;
  plots: (StoredPlot & { hectares: number | null })[];
  practices: Record<string, unknown>;
  tx_hash: string;
  explorer_url: string;
}

/**
 * `farmer.profile`. Each message creates a new version of the farm profile:
 * the fields it sends replace the current ones, the rest are kept. The
 * version's hash is recorded on chain (`set_profile`).
 */
export async function updateProfile(ctx: IntegrationContext, data: FarmerProfileData): Promise<ProfileResult> {
  const farmer = await findRegisteredFarmer(data.farmer_ref);
  const { farmerRef } = farmer;

  let row = await prisma.farmerProfileVersion.findUnique({ where: { integrationEventId: ctx.integrationEventId } });
  if (!row) {
    requireConsent(farmer, farmerRef);

    const outside = (data.plots ?? [])
      .map((plot, index) => ({ index, location: plot.location }))
      .filter(({ location }) => location && !isInFarmArea(location.lat, location.lng));
    if (outside.length > 0) {
      throw new HttpException(
        422,
        'A plot location is outside the pilot area (Gomma woreda). Ask the farmer to check it.',
        'LOCATION_OUTSIDE_AREA',
        outside.map(({ index, location }) => ({ plot: index, lat: location!.lat, lng: location!.lng }))
      );
    }

    // Omitted fields keep the current (confirmed) profile's values.
    const current = (farmer.profile ?? null) as StoredProfile | null;
    const plots = data.plots ? data.plots.map(toStoredPlot) : (current?.plots ?? []);
    const practices = data.practices ?? current?.practices ?? {};

    for (let attempt = 0; !row && attempt < 5; attempt++) {
      const last = await prisma.farmerProfileVersion.findFirst({
        where: { farmerId: farmer.id },
        orderBy: { version: 'desc' },
        select: { version: true },
      });
      const profile: StoredProfile = {
        farmer_ref: farmerRef,
        version: (last?.version ?? 0) + 1,
        plots,
        practices,
      };
      try {
        row = await prisma.farmerProfileVersion.create({
          data: {
            farmerId: farmer.id,
            integrationEventId: ctx.integrationEventId,
            version: profile.version,
            profile: profile as unknown as Prisma.InputJsonValue,
            profileHash: sha256Canonical(profile),
            transcript: data.transcript ?? null,
            audioRef: data.audio_ref ?? null,
          },
        });
      } catch (error) {
        if (isUniqueViolation(error, 'integration_event_id')) {
          row = await prisma.farmerProfileVersion.findUniqueOrThrow({
            where: { integrationEventId: ctx.integrationEventId },
          });
        } else if (!isUniqueViolation(error)) {
          throw error;
        }
        // Another update took this version number: try the next one.
      }
    }
    if (!row) throw new HttpException(503, 'Too many concurrent profile updates. Retry.', 'PROFILE_CONFLICT');
  }

  const version = row;
  const profile = version.profile as unknown as StoredProfile;
  const txHash = await ensureOnChain({
    label: `set_profile ${farmerRef} v${version.version}`,
    state: { tx: version.tx, txValidUntil: version.txValidUntil, confirmedAt: version.confirmedAt },
    build: OnChainTraceabilityService.build.setProfile(farmerRef, version.profileHash),
    claim: async (previous, hash, validUntil) => {
      const { count } = await prisma.farmerProfileVersion.updateMany({
        where: { id: version.id, confirmedAt: null, tx: previous },
        data: { tx: hash, txValidUntil: validUntil },
      });
      return count === 1;
    },
    release: async (hash) => {
      await prisma.farmerProfileVersion.updateMany({
        where: { id: version.id, tx: hash, confirmedAt: null },
        data: { tx: null, txValidUntil: null },
      });
    },
    confirm: async (hash) => {
      await OnChainTraceabilityService.verifyProfileUpdated(hash, farmerRef, version.profileHash);
      await prisma.$transaction(async (tx) => {
        await tx.farmerProfileVersion.update({
          where: { id: version.id },
          data: { tx: hash, confirmedAt: new Date(), txValidUntil: null },
        });
        // Only a newer version replaces the current profile and its plots.
        const { count } = await tx.farmer.updateMany({
          where: { id: farmer.id, profileVersion: { lt: version.version } },
          data: {
            profile: version.profile as Prisma.InputJsonValue,
            profileVersion: version.version,
            profileHash: version.profileHash,
            profileTx: hash,
            profileAt: new Date(),
          },
        });
        if (count === 0) return;
        await tx.plot.deleteMany({ where: { farmerId: farmer.id } });
        await tx.plot.createMany({
          data: profile.plots.map((plot, position) => ({
            farmerId: farmer.id,
            profileVersion: version.version,
            position,
            name: plot.name,
            sizeValue: plot.size?.value ?? null,
            sizeUnit: plot.size?.unit ?? null,
            sizeHectares: hectaresOf(plot),
            latitude: plot.location?.lat ?? null,
            longitude: plot.location?.lng ?? null,
            locationSource: plot.location?.source ?? null,
          })),
        });
        await tx.farmer.updateMany({
          where: { id: farmer.id, status: { in: [FarmerStatus.LINKED, FarmerStatus.CONSENTED] } },
          data: { status: FarmerStatus.REGISTERED },
        });
      });
    },
    pending: transactionPending,
  });

  logger.info({ farmerRef, version: version.version, txHash }, 'Updated farm profile');
  return {
    farmer_ref: farmerRef,
    profile_version: version.version,
    profile_hash: version.profileHash,
    plots: profile.plots.map((plot) => ({ ...plot, hectares: hectaresOf(plot) })),
    practices: profile.practices,
    tx_hash: txHash,
    explorer_url: explorerTxUrl(txHash),
  };
}
