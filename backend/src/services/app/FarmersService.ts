import { FarmerStatus, Prisma } from '@prisma/client';

import { HttpException } from '@/exceptions/HttpException';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { parseCsv } from '@/utils/csv';

/** Headers accepted by the import. Only the first two are required. */
export const FARMER_CSV_COLUMNS = [
  'coop_code',
  'farmer_id',
  'full_name',
  'phone',
  'collection_center',
] as const;

const REQUIRED_COLUMNS = ['coop_code', 'farmer_id'] as const;

/** Maximum length of a cooperative ID: the on-chain `farmer_ref` is capped at 64. */
const MAX_FARMER_ID_LEN = 48;

export interface ImportRowError {
  /** CSV line number, counting the header as line 1. */
  line: number;
  message: string;
}

export interface ImportResult {
  dryRun: boolean;
  created: number;
  updated: number;
  unchanged: number;
  errors: ImportRowError[];
}

/**
 * The farmer's on-chain ID: the cooperative code plus their ID.
 *
 * The IDs each cooperative assigns are only unique within it; with the prefix
 * (`KK-ID123`) they are unique across the whole pilot.
 */
export function buildFarmerRef(coopCode: string, coopFarmerId: string): string {
  return `${coopCode}-${coopFarmerId}`;
}

/** Normalizes an ID as typed by the farmer: no spaces, upper case. */
export function normalizeFarmerId(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * Imports (or updates) the farmer list provided by the cooperative.
 *
 * - It is idempotent: the key is (cooperative, ID). Uploading the same file
 *   again does not create duplicates.
 * - It never touches the Telegram link or the wallet: the farmer does that
 *   through the bot.
 * - With `dryRun` it validates everything and reports what it would do,
 *   without writing.
 * - If any row has errors nothing is written: the admin fixes the file and
 *   uploads it again.
 */
export async function importFarmersCsv(csv: string, dryRun: boolean): Promise<ImportResult> {
  const rows = parseCsv(csv);
  if (rows.length === 0) {
    throw new HttpException(400, 'The CSV is empty', 'EMPTY_CSV');
  }

  const header = rows[0].map((value) => value.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((column) => !header.includes(column));
  if (missing.length > 0) {
    throw new HttpException(
      400,
      `Missing required columns: ${missing.join(', ')}. Expected: ${FARMER_CSV_COLUMNS.join(', ')}`,
      'INVALID_CSV_HEADER'
    );
  }
  const col = (row: string[], name: (typeof FARMER_CSV_COLUMNS)[number]) => {
    const index = header.indexOf(name);
    return index === -1 ? '' : (row[index] ?? '').trim();
  };

  const cooperatives = await prisma.organization.findMany({
    where: { kind: 'COOPERATIVE' },
    include: { collectionCenters: true },
  });
  const coopByCode = new Map(cooperatives.map((coop) => [coop.code, coop]));

  const errors: ImportRowError[] = [];
  const seen = new Set<string>();
  const parsed: {
    organizationId: string;
    coopFarmerId: string;
    fullName: string | null;
    phone: string | null;
    collectionCenterId: string | null;
  }[] = [];

  rows.slice(1).forEach((row, index) => {
    const line = index + 2;
    const coopCode = col(row, 'coop_code').toUpperCase();
    const farmerId = normalizeFarmerId(col(row, 'farmer_id'));
    const coop = coopByCode.get(coopCode);

    if (!coop) {
      errors.push({ line, message: `Unknown coop_code "${coopCode}"` });
      return;
    }
    if (!farmerId) {
      errors.push({ line, message: 'farmer_id is empty' });
      return;
    }
    if (farmerId.length > MAX_FARMER_ID_LEN) {
      errors.push({ line, message: `farmer_id is longer than ${MAX_FARMER_ID_LEN} characters` });
      return;
    }
    const key = `${coop.id}:${farmerId}`;
    if (seen.has(key)) {
      errors.push({ line, message: `Duplicated farmer_id ${farmerId} for ${coopCode}` });
      return;
    }
    seen.add(key);

    let collectionCenterId: string | null = null;
    const centerName = col(row, 'collection_center');
    if (centerName) {
      const center = coop.collectionCenters.find(
        (c) => c.name.toLowerCase() === centerName.toLowerCase()
      );
      if (!center) {
        errors.push({ line, message: `Collection center "${centerName}" is not part of ${coopCode}` });
        return;
      }
      collectionCenterId = center.id;
    }

    parsed.push({
      organizationId: coop.id,
      coopFarmerId: farmerId,
      fullName: col(row, 'full_name') || null,
      phone: col(row, 'phone') || null,
      collectionCenterId,
    });
  });

  const existing = await prisma.farmer.findMany({
    where: {
      OR: parsed.map((p) => ({ organizationId: p.organizationId, coopFarmerId: p.coopFarmerId })),
    },
  });
  const existingByKey = new Map(existing.map((f) => [`${f.organizationId}:${f.coopFarmerId}`, f]));

  const toCreate: Prisma.FarmerCreateManyInput[] = [];
  const toUpdate: { id: string; data: Prisma.FarmerUpdateInput }[] = [];
  let unchanged = 0;

  for (const row of parsed) {
    const current = existingByKey.get(`${row.organizationId}:${row.coopFarmerId}`);
    if (!current) {
      toCreate.push({ ...row, status: FarmerStatus.PRELOADED });
      continue;
    }
    // An empty CSV field does not erase existing data.
    const data: Prisma.FarmerUncheckedUpdateInput = {};
    if (row.fullName && row.fullName !== current.fullName) data.fullName = row.fullName;
    if (row.phone && row.phone !== current.phone) data.phone = row.phone;
    if (row.collectionCenterId && row.collectionCenterId !== current.collectionCenterId) {
      data.collectionCenterId = row.collectionCenterId;
    }
    if (Object.keys(data).length === 0) {
      unchanged++;
    } else {
      toUpdate.push({ id: current.id, data: data as Prisma.FarmerUpdateInput });
    }
  }

  const result: ImportResult = {
    dryRun,
    created: toCreate.length,
    updated: toUpdate.length,
    unchanged,
    errors,
  };
  if (dryRun || errors.length > 0) {
    return result;
  }

  await prisma.$transaction([
    prisma.farmer.createMany({ data: toCreate }),
    ...toUpdate.map(({ id, data }) => prisma.farmer.update({ where: { id }, data })),
  ]);
  logger.info({ created: result.created, updated: result.updated }, 'Imported farmers CSV');
  return result;
}

export async function listFarmers(filters: {
  organizationId?: string;
  status?: FarmerStatus;
  search?: string;
  limit: number;
  offset: number;
}) {
  const where: Prisma.FarmerWhereInput = {};
  if (filters.organizationId) where.organizationId = filters.organizationId;
  if (filters.status) where.status = filters.status;
  if (filters.search) {
    where.OR = [
      { coopFarmerId: { contains: filters.search, mode: 'insensitive' } },
      { fullName: { contains: filters.search, mode: 'insensitive' } },
    ];
  }
  const [total, farmers, byStatus] = await Promise.all([
    prisma.farmer.count({ where }),
    prisma.farmer.findMany({
      where,
      take: filters.limit,
      skip: filters.offset,
      orderBy: [{ organizationId: 'asc' }, { coopFarmerId: 'asc' }],
      include: {
        organization: { select: { id: true, code: true, name: true } },
        collectionCenter: { select: { id: true, name: true } },
      },
    }),
    prisma.farmer.groupBy({
      by: ['status'],
      where: filters.organizationId ? { organizationId: filters.organizationId } : {},
      _count: { _all: true },
    }),
  ]);
  return {
    total,
    // BigInt does not serialize to JSON: the Telegram ID travels as text.
    farmers: farmers.map((f) => ({ ...f, telegramUserId: f.telegramUserId?.toString() ?? null })),
    statusCounts: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
  };
}

export type LinkResult =
  | { ok: true; farmerId: string; alreadyLinked: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'LINKED_TO_OTHER_ACCOUNT' | 'TELEGRAM_ALREADY_REGISTERED' };

/**
 * The bot links a Telegram chat to a pre-loaded farmer.
 *
 * A farmer can only be linked to one Telegram account, and a Telegram account
 * to a single farmer. If the ID is already taken by another account, the
 * farmer has to talk to their cooperative.
 */
export async function linkTelegram(params: {
  organizationId: string;
  coopFarmerId: string;
  telegramUserId: bigint;
  telegramUsername?: string | null;
  language?: string | null;
}): Promise<LinkResult> {
  const farmer = await prisma.farmer.findUnique({
    where: {
      organizationId_coopFarmerId: {
        organizationId: params.organizationId,
        coopFarmerId: normalizeFarmerId(params.coopFarmerId),
      },
    },
  });
  if (!farmer) return { ok: false, reason: 'NOT_FOUND' };

  if (farmer.telegramUserId !== null) {
    if (farmer.telegramUserId === params.telegramUserId) {
      return { ok: true, farmerId: farmer.id, alreadyLinked: true };
    }
    return { ok: false, reason: 'LINKED_TO_OTHER_ACCOUNT' };
  }

  // If this Telegram account was linked to another farmer who has not finished
  // registering (they typed the wrong ID), that link is released. If they had
  // finished registering, it is not: the cooperative has to resolve it.
  const previous = await prisma.farmer.findUnique({ where: { telegramUserId: params.telegramUserId } });
  if (previous && previous.status !== FarmerStatus.LINKED) {
    return { ok: false, reason: 'TELEGRAM_ALREADY_REGISTERED' };
  }

  await prisma.$transaction([
    prisma.farmer.updateMany({
      where: { telegramUserId: params.telegramUserId, status: FarmerStatus.LINKED },
      data: { telegramUserId: null, telegramUsername: null, linkedAt: null, status: FarmerStatus.PRELOADED },
    }),
    prisma.farmer.update({
      where: { id: farmer.id },
      data: {
        telegramUserId: params.telegramUserId,
        telegramUsername: params.telegramUsername ?? null,
        language: params.language ?? null,
        linkedAt: new Date(),
        status: farmer.status === FarmerStatus.PRELOADED ? FarmerStatus.LINKED : farmer.status,
      },
    }),
  ]);
  logger.info({ farmerId: farmer.id }, 'Linked farmer with Telegram');
  return { ok: true, farmerId: farmer.id, alreadyLinked: false };
}

export async function findFarmerByTelegramUser(telegramUserId: bigint) {
  return prisma.farmer.findUnique({
    where: { telegramUserId },
    include: { organization: true, collectionCenter: true },
  });
}
