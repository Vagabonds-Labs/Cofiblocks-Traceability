import { z } from 'zod';

import { STAFF_ROLES } from './userSchemas';

const userIdParams = z.object({
  userId: z.string().uuid('Invalid user ID format'),
});

/** Asignar un rol del piloto. El Collector necesita además su centro de acopio. */
export const assignRoleSchema = z.object({
  params: userIdParams,
  body: z
    .object({
      role: z.enum(STAFF_ROLES),
      organizationId: z.string().uuid(),
      collectionCenterId: z.string().uuid().nullable().optional(),
    })
    .refine((data) => data.role !== 'COLLECTOR' || !!data.collectionCenterId, {
      message: 'Collectors need a collection center',
      path: ['collectionCenterId'],
    }),
});

export const revokeRoleSchema = z.object({
  params: userIdParams,
});

/** El CSV viaja como texto en el body: 200 caficultores entran holgados. */
export const importFarmersSchema = z.object({
  body: z.object({
    csv: z.string().min(1, 'csv is required').max(2_000_000),
    dryRun: z.boolean().optional().default(false),
  }),
});

export const listFarmersSchema = z.object({
  query: z.object({
    organization_id: z.string().uuid().optional(),
    status: z.enum(['PRELOADED', 'LINKED', 'REGISTERED', 'CONSENTED']).optional(),
    search: z.string().trim().max(100).optional(),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 50))
      .pipe(z.number().int().min(1).max(500)),
    offset: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 0))
      .pipe(z.number().int().min(0)),
  }),
});

export type AssignRoleRequest = z.infer<typeof assignRoleSchema>['body'];
export type ImportFarmersRequest = z.infer<typeof importFarmersSchema>['body'];
export type ListFarmersQuery = z.infer<typeof listFarmersSchema>['query'];
