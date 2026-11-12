import { BatchStage } from '@prisma/client';
import { DateTime } from 'luxon';

import { MAX_DELIVERY_AGE_DAYS, MAX_ESTIMATED_KG, PILOT_TIME_ZONE } from '@/config/pilot';
import { HttpException } from '@/exceptions/HttpException';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import type { DeliveryCreatedData } from '@/schemas/integrationSchemas';
import {
  explorerTxUrl,
  findRegisteredFarmer,
  IntegrationContext,
  isUniqueViolation,
  requireConsent,
} from '@/services/app/FarmerDataService';
import * as OnChainTraceabilityService from '@/services/onchain/OnChainTraceabilityService';
import { asFarmerAgent, ensureOnChain, transactionPending } from '@/services/onchain/ensureOnChain';
import { sha256Canonical } from '@/utils/canonicalJson';

/** The contract's limit for batch IDs. */
const MAX_BATCH_ID_LEN = 64;

/** Further deliveries of a farmer on the same day: `/2` … `/MAX_SAME_DAY`. */
const MAX_SAME_DAY = 50;

/** How much `occurred_at` may be ahead of our clock. */
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * The delivery record whose SHA-256 goes on chain with `create_batch`. Every
 * field comes from the `Batch` row, so the hash can always be recomputed.
 */
export function deliveryRecord(batch: {
  number: string;
  farmerRef: string;
  coopCode: string;
  centerName: string;
  centerChainId: number;
  deliveredAt: Date;
  estimatedKg: number | null;
  ripeness: string | null;
}) {
  return {
    batch_id: batch.number,
    farmer_ref: batch.farmerRef,
    coop_code: batch.coopCode,
    collection_center: batch.centerName,
    collection_center_id: batch.centerChainId,
    delivered_at: batch.deliveredAt.toISOString(),
    estimated_kg: batch.estimatedKg,
    ripeness: batch.ripeness,
  };
}

/** `DD-MM-YYYY <farmer_ref>` for the first delivery of the day, then `/2`, `/3`… */
export function batchNumber(deliveredAt: Date, farmerRef: string, sequence: number): string {
  const day = DateTime.fromJSDate(deliveredAt).setZone(PILOT_TIME_ZONE).toFormat('dd-MM-yyyy');
  const base = `${day} ${farmerRef}`;
  return sequence === 1 ? base : `${base}/${sequence}`;
}

function deliveryDate(occurredAt: Date | null): Date {
  const now = Date.now();
  if (!occurredAt) return new Date(now);
  if (occurredAt.getTime() > now + CLOCK_SKEW_MS) {
    throw new HttpException(422, 'occurred_at is in the future', 'INVALID_DELIVERY_DATE');
  }
  if (occurredAt.getTime() < now - MAX_DELIVERY_AGE_DAYS * 24 * 3600 * 1000) {
    throw new HttpException(
      422,
      `occurred_at is more than ${MAX_DELIVERY_AGE_DAYS} days ago`,
      'INVALID_DELIVERY_DATE'
    );
  }
  return occurredAt;
}

export interface DeliveryResult {
  batch_id: string;
  farmer_ref: string;
  collection_center: string;
  estimated_kg: number | null;
  ripeness: string | null;
  delivered_at: string;
  stage: 'DELIVERED';
  data_hash: string;
  tx_hash: string;
  explorer_url: string;
}

/**
 * `delivery.created`: records a farmer's delivery as a new batch, on chain
 * with `create_batch` (signed by the farmer agent). This is the SOW proof "a
 * farmer creates a batch". The record is immutable from then on.
 */
export async function createDelivery(ctx: IntegrationContext, data: DeliveryCreatedData): Promise<DeliveryResult> {
  const farmer = await findRegisteredFarmer(data.farmer_ref);
  const { farmerRef } = farmer;
  const coop = farmer.organization;

  let batch = await prisma.batch.findUnique({
    where: { integrationEventId: ctx.integrationEventId },
    include: { collectionCenter: true },
  });

  if (!batch) {
    requireConsent(farmer, farmerRef);

    const center = coop.collectionCenters.find(
      (c) => c.name.toLowerCase() === data.collection_center.toLowerCase()
    );
    if (!center) {
      throw new HttpException(
        422,
        `${data.collection_center} is not a collection center of ${coop.code}`,
        'UNKNOWN_COLLECTION_CENTER',
        { valid: coop.collectionCenters.map((c) => c.name) }
      );
    }
    if (data.estimated_kg != null && data.estimated_kg > MAX_ESTIMATED_KG) {
      throw new HttpException(
        422,
        `estimated_kg is above ${MAX_ESTIMATED_KG} kg. Ask the farmer to confirm the quantity.`,
        'ESTIMATED_KG_TOO_HIGH'
      );
    }
    const deliveredAt = deliveryDate(ctx.occurredAt);
    // Rounded to what the database keeps, so the hash can be recomputed from it.
    const estimatedKg = data.estimated_kg != null ? Math.round(data.estimated_kg * 100) / 100 : null;
    const ripeness = data.ripeness ? data.ripeness.toLowerCase() : null;

    for (let sequence = 1; !batch && sequence <= MAX_SAME_DAY; sequence++) {
      const number = batchNumber(deliveredAt, farmerRef, sequence);
      if (number.length > MAX_BATCH_ID_LEN) {
        throw new HttpException(422, `Batch number ${number} is too long`, 'INVALID_BATCH_ID');
      }
      if (await prisma.batch.findUnique({ where: { number }, select: { id: true } })) continue;
      // The chain outlives test databases: never reuse a number it already has.
      if (await OnChainTraceabilityService.findBatch(number)) continue;

      const dataHash = sha256Canonical(
        deliveryRecord({
          number,
          farmerRef,
          coopCode: coop.code,
          centerName: center.name,
          centerChainId: center.chainId,
          deliveredAt,
          estimatedKg,
          ripeness,
        })
      );
      try {
        batch = await prisma.batch.create({
          data: {
            number,
            farmerId: farmer.id,
            organizationId: coop.id,
            collectionCenterId: center.id,
            integrationEventId: ctx.integrationEventId,
            deliveredAt,
            estimatedKg,
            ripeness,
            transcript: data.transcript ?? null,
            audioRef: data.audio_ref ?? null,
            dataHash,
          },
          include: { collectionCenter: true },
        });
      } catch (error) {
        if (!isUniqueViolation(error)) throw error;
        if (isUniqueViolation(error, 'integration_event_id')) {
          batch = await prisma.batch.findUniqueOrThrow({
            where: { integrationEventId: ctx.integrationEventId },
            include: { collectionCenter: true },
          });
        }
        // Otherwise another delivery took this number: try the next one.
      }
    }
    if (!batch) {
      throw new HttpException(422, `Too many deliveries for ${farmerRef} on the same day`, 'TOO_MANY_DELIVERIES');
    }
  }

  const row = batch;
  const center = row.collectionCenter;
  const record = deliveryRecord({
    number: row.number,
    farmerRef,
    coopCode: coop.code,
    centerName: center.name,
    centerChainId: center.chainId,
    deliveredAt: row.deliveredAt,
    estimatedKg: row.estimatedKg !== null ? Number(row.estimatedKg) : null,
    ripeness: row.ripeness,
  });

  const txHash = await ensureOnChain({
    label: `create_batch ${row.number}`,
    state: { tx: row.createTx, txValidUntil: row.createTxValidUntil, confirmedAt: row.createdOnChainAt },
    send: asFarmerAgent(OnChainTraceabilityService.build.createBatch(row.number, farmerRef, center.chainId, row.dataHash)),
    claim: async (previous, hash, validUntil) => {
      const { count } = await prisma.batch.updateMany({
        where: { id: row.id, createdOnChainAt: null, createTx: previous },
        data: { createTx: hash, createTxValidUntil: validUntil },
      });
      return count === 1;
    },
    release: async (hash) => {
      await prisma.batch.updateMany({
        where: { id: row.id, createTx: hash, createdOnChainAt: null },
        data: { createTx: null, createTxValidUntil: null },
      });
    },
    confirm: async (hash) => {
      await OnChainTraceabilityService.verifyBatchCreated(hash, row.number, farmerRef, center.chainId, row.dataHash);
      await prisma.$transaction([
        prisma.batch.update({
          where: { id: row.id },
          data: { createTx: hash, createdOnChainAt: new Date(), createTxValidUntil: null },
        }),
        prisma.batchEvent.upsert({
          where: { txHash: hash },
          create: {
            batchId: row.id,
            stage: BatchStage.DELIVERED,
            actorAddress: OnChainTraceabilityService.getFarmerAgentAddress(),
            data: record,
            dataHash: row.dataHash,
            txHash: hash,
          },
          update: {},
        }),
      ]);
    },
    pending: transactionPending,
  });

  logger.info({ batch: row.number, farmerRef, txHash }, 'Recorded delivery on chain');
  return {
    batch_id: row.number,
    farmer_ref: farmerRef,
    collection_center: center.name,
    estimated_kg: record.estimated_kg,
    ripeness: row.ripeness,
    delivered_at: record.delivered_at,
    stage: 'DELIVERED',
    data_hash: row.dataHash,
    tx_hash: txHash,
    explorer_url: explorerTxUrl(txHash),
  };
}
