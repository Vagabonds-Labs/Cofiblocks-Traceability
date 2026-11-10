import { FarmerStatus, Prisma } from '@prisma/client';

import { HttpException } from '@/exceptions/HttpException';
import { prisma } from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { parseCsv } from '@/utils/csv';

/** Encabezados que acepta la importación. Sólo los dos primeros son obligatorios. */
export const FARMER_CSV_COLUMNS = [
  'coop_code',
  'farmer_id',
  'full_name',
  'phone',
  'collection_center',
] as const;

const REQUIRED_COLUMNS = ['coop_code', 'farmer_id'] as const;

/** Largo máximo de un ID de cooperativa: el `farmer_ref` on-chain tiene tope 64. */
const MAX_FARMER_ID_LEN = 48;

export interface ImportRowError {
  /** Número de línea del CSV, contando el encabezado como línea 1. */
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
 * ID on-chain del caficultor: el código de la cooperativa más su ID.
 *
 * Los IDs que asigna cada cooperativa sólo son únicos dentro de ella; con el
 * prefijo (`KK-ID123`) son únicos en todo el piloto.
 */
export function buildFarmerRef(coopCode: string, coopFarmerId: string): string {
  return `${coopCode}-${coopFarmerId}`;
}

/** Normaliza un ID tal como lo escribe el caficultor: sin espacios y en mayúsculas. */
export function normalizeFarmerId(value: string): string {
  return value.replace(/\s+/g, '').toUpperCase();
}

/**
 * Importa (o actualiza) la lista de caficultores que entrega la cooperativa.
 *
 * - Es idempotente: la clave es (cooperativa, ID). Volver a subir el mismo
 *   archivo no crea duplicados.
 * - Nunca toca el vínculo con Telegram ni la wallet: eso lo hace el propio
 *   caficultor desde el bot.
 * - Con `dryRun` valida todo y dice qué haría, sin escribir.
 * - Si alguna fila tiene errores no se escribe nada: el admin corrige el
 *   archivo y lo vuelve a subir.
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
    // Un campo vacío en el CSV no borra lo que ya hay.
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
    // BigInt no se serializa a JSON: el id de Telegram viaja como texto.
    farmers: farmers.map((f) => ({ ...f, telegramUserId: f.telegramUserId?.toString() ?? null })),
    statusCounts: Object.fromEntries(byStatus.map((s) => [s.status, s._count._all])),
  };
}

export type LinkResult =
  | { ok: true; farmerId: string; alreadyLinked: boolean }
  | { ok: false; reason: 'NOT_FOUND' | 'LINKED_TO_OTHER_ACCOUNT' | 'TELEGRAM_ALREADY_REGISTERED' };

/**
 * El bot vincula un chat de Telegram con un caficultor precargado.
 *
 * Un caficultor sólo puede quedar vinculado a una cuenta de Telegram, y una
 * cuenta de Telegram a un solo caficultor. Si el ID ya está tomado por otra
 * cuenta, el caficultor tiene que hablar con su cooperativa.
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

  // Si esta cuenta de Telegram estaba vinculada a otro caficultor que todavía
  // no completó el registro (se equivocó de ID), se libera ese vínculo. Si ya
  // completó el registro, no: lo tiene que resolver la cooperativa.
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
