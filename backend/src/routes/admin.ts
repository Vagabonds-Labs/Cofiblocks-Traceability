import { Router, Request, Response } from 'express';

import { authenticate, requireAdmin, validate } from '@/middleware';
import {
  assignRoleSchema,
  importFarmersSchema,
  listFarmersSchema,
  revokeRoleSchema,
  type AssignRoleRequest,
  type ImportFarmersRequest,
  type ListFarmersQuery,
} from '@/schemas/adminSchemas';
import * as FarmersService from '@/services/app/FarmersService';
import * as UsersService from '@/services/app/UsersService';
import { successResponse } from '@/utils/formatting';

const router = Router();

router.use(authenticate, requireAdmin);

/**
 * PUT /api/admin/users/:userId/role
 * Asigna el rol del piloto: lo escribe en el contrato y después en la base.
 */
router.put('/users/:userId/role', validate(assignRoleSchema), async (req: Request, res: Response) => {
  const { role, organizationId, collectionCenterId } = req.body as AssignRoleRequest;
  const result = await UsersService.assignRole(
    req.params.userId,
    role,
    organizationId,
    collectionCenterId
  );
  successResponse(res, result, 'Role assigned', 200);
});

/** DELETE /api/admin/users/:userId/role */
router.delete('/users/:userId/role', validate(revokeRoleSchema), async (req: Request, res: Response) => {
  const result = await UsersService.revokeRole(req.params.userId);
  successResponse(res, result, 'Role revoked', 200);
});

/** GET /api/admin/farmers — lista con filtros y conteo por estado. */
router.get('/farmers', validate(listFarmersSchema), async (req: Request, res: Response) => {
  const query = req.query as unknown as ListFarmersQuery;
  const result = await FarmersService.listFarmers({
    organizationId: query.organization_id,
    status: query.status,
    search: query.search,
    limit: query.limit,
    offset: query.offset,
  });
  successResponse(res, result);
});

/**
 * POST /api/admin/farmers/import
 * Importa la lista de caficultores de la cooperativa (CSV como texto).
 * Con `dryRun: true` sólo valida y dice qué haría.
 */
router.post('/farmers/import', validate(importFarmersSchema), async (req: Request, res: Response) => {
  const { csv, dryRun } = req.body as ImportFarmersRequest;
  const result = await FarmersService.importFarmersCsv(csv, dryRun);
  const status = result.errors.length > 0 ? 422 : 200;
  successResponse(res, result, result.errors.length > 0 ? 'The CSV has errors' : 'Import processed', status);
});

export default router;
