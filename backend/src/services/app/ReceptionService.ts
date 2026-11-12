import { BatchStage, StaffRole } from '@prisma/client';

import { HttpException } from '@/exceptions/HttpException';
import { addressVal, bytes32Val, stringVal, u64Val } from '@/lib/StellarContracts/utils/scval';
import type { PreparedTransaction } from '@/lib/StellarContracts/types/transactions';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/prisma';
import { explorerTxUrl } from '@/services/app/FarmerDataService';
import * as OnChainTraceabilityService from '@/services/onchain/OnChainTraceabilityService';
import { asStaffSigned, ensureOnChain, transactionPending } from '@/services/onchain/ensureOnChain';
import { sha256Canonical } from '@/utils/canonicalJson';

/** Largest weight a Collector may record for one delivery, in kg. */
const MAX_WEIGHT_KG = 5000;

export interface ReceptionInput {
  /** Batch number, e.g. `24-11-2026 KK-ID001`. */
  batchNumber: string;
  /** Weight on the scale, in kg (up to grams). */
  weightKg: number;
  /** SHA-256 (hex) of the receipt photo or file. */
  receiptSha256: string;
  notes?: string | null;
}

/**
 * The reception record whose SHA-256 goes on chain as `data_hash`. It is
 * built from the input alone, so `prepare` and `submit` compute the same one.
 */
function receptionRecord(batchNumber: string, collector: string, weightGrams: bigint, input: ReceptionInput) {
  return {
    batch_id: batchNumber,
    collector,
    weight_grams: weightGrams.toString(),
    receipt_sha256: input.receiptSha256.toLowerCase(),
    notes: input.notes?.trim() || null,
  };
}

/** Checks the Collector and the batch off chain; the contract checks again. */
async function load(userId: string, input: ReceptionInput) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user?.walletAddress) throw new HttpException(400, 'User has no wallet', 'USER_WITHOUT_WALLET');
  if (user.role !== StaffRole.COLLECTOR) {
    throw new HttpException(403, 'Only a Coffee Collector records the weight and receipt', 'UNAUTHORIZED');
  }

  const batch = await prisma.batch.findUnique({
    where: { number: input.batchNumber },
    include: { collectionCenter: true },
  });
  if (!batch) throw new HttpException(404, `Batch ${input.batchNumber} not found`, 'BATCH_NOT_FOUND');
  if (batch.organizationId !== user.organizationId) {
    throw new HttpException(403, 'The batch belongs to another cooperative', 'WRONG_ORGANIZATION');
  }
  if (!batch.createdOnChainAt) {
    throw new HttpException(409, 'The delivery is not confirmed on chain yet', 'BATCH_NOT_ON_CHAIN');
  }

  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0 || input.weightKg > MAX_WEIGHT_KG) {
    throw new HttpException(400, `Weight must be between 0 and ${MAX_WEIGHT_KG} kg`, 'INVALID_WEIGHT');
  }
  if (!/^[0-9a-fA-F]{64}$/.test(input.receiptSha256)) {
    throw new HttpException(400, 'receiptSha256 must be a hex SHA-256', 'INVALID_RECEIPT_HASH');
  }

  const weightGrams = BigInt(Math.round(input.weightKg * 1000));
  const record = receptionRecord(batch.number, user.walletAddress, weightGrams, input);
  const dataHash = sha256Canonical(record);
  const args = [
    addressVal(user.walletAddress),
    stringVal(batch.number),
    u64Val(weightGrams),
    bytes32Val(record.receipt_sha256),
    bytes32Val(dataHash),
  ];
  return { user, wallet: user.walletAddress, batch, weightGrams, record, dataHash, args };
}

/**
 * Step 1: the backend checks the request and returns the `record_reception`
 * transaction for the Collector's wallet to sign (with Cavos `signXdr` in the
 * web app).
 */
export async function prepareReception(
  userId: string,
  input: ReceptionInput
): Promise<{ prepared: PreparedTransaction; data_hash: string }> {
  const { batch, wallet, weightGrams, record, dataHash } = await load(userId, input);
  if (batch.receivedAt) {
    throw new HttpException(409, 'The weight and receipt were already recorded', 'RECEPTION_ALREADY_RECORDED');
  }
  const prepared = await OnChainTraceabilityService.prepareReception(
    wallet,
    batch.number,
    weightGrams,
    record.receipt_sha256,
    dataHash
  );
  return { prepared, data_hash: dataHash };
}

export interface ReceptionResult {
  batch_id: string;
  stage: 'RECEIVED';
  weight_grams: string;
  receipt_sha256: string;
  data_hash: string;
  tx_hash: string;
  explorer_url: string;
}

/**
 * Step 2: the backend checks that the signed transaction is exactly the one
 * prepared for this input, sends it with its fee-bump (exactly once), checks
 * the event and stores the reception. The batch moves to `RECEIVED`.
 */
export async function submitReception(userId: string, input: ReceptionInput, signedXdr: string): Promise<ReceptionResult> {
  const { user, wallet, batch, weightGrams, record, dataHash, args } = await load(userId, input);
  OnChainTraceabilityService.assertStaffInvocation(signedXdr, wallet, 'record_reception', args);
  // Recorded already: a retry of that same reception gets its answer again;
  // anything else is a second reception, which is never allowed.
  if (batch.receivedAt && (batch.receivedById !== user.id || batch.weightGrams !== weightGrams || batch.receiptHash !== record.receipt_sha256)) {
    throw new HttpException(409, 'The weight and receipt were already recorded', 'RECEPTION_ALREADY_RECORDED');
  }

  const txHash = await ensureOnChain({
    label: `record_reception ${batch.number}`,
    state: { tx: batch.receptionTx, txValidUntil: batch.receptionTxValidUntil, confirmedAt: batch.receivedAt },
    send: asStaffSigned(signedXdr),
    claim: async (previous, hash, validUntil) => {
      const { count } = await prisma.batch.updateMany({
        where: { id: batch.id, receivedAt: null, receptionTx: previous },
        data: { receptionTx: hash, receptionTxValidUntil: validUntil },
      });
      return count === 1;
    },
    release: async (hash) => {
      await prisma.batch.updateMany({
        where: { id: batch.id, receptionTx: hash, receivedAt: null },
        data: { receptionTx: null, receptionTxValidUntil: null },
      });
    },
    confirm: async (hash) => {
      await OnChainTraceabilityService.verifyReceptionRecorded(
        hash,
        batch.number,
        wallet,
        weightGrams,
        record.receipt_sha256,
        dataHash
      );
      await prisma.$transaction([
        prisma.batch.update({
          where: { id: batch.id },
          data: {
            stage: BatchStage.RECEIVED,
            weightGrams,
            receiptHash: record.receipt_sha256,
            receptionTx: hash,
            receptionTxValidUntil: null,
            receivedAt: new Date(),
            receivedById: user.id,
          },
        }),
        prisma.batchEvent.upsert({
          where: { txHash: hash },
          create: {
            batchId: batch.id,
            stage: BatchStage.RECEIVED,
            actorAddress: wallet,
            actorUserId: user.id,
            data: record,
            dataHash,
            txHash: hash,
          },
          update: {},
        }),
      ]);
    },
    pending: transactionPending,
  });

  logger.info({ batch: batch.number, txHash, weightGrams: weightGrams.toString() }, 'Recorded reception');
  return {
    batch_id: batch.number,
    stage: 'RECEIVED',
    weight_grams: weightGrams.toString(),
    receipt_sha256: record.receipt_sha256,
    data_hash: dataHash,
    tx_hash: txHash,
    explorer_url: explorerTxUrl(txHash),
  };
}
