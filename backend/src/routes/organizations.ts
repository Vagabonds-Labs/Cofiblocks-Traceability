import { Router, Request, Response } from 'express';

import { authenticate } from '@/middleware';
import * as OrganizationsService from '@/services/app/OrganizationsService';
import { successResponse } from '@/utils/formatting';

const router = Router();

/** GET /api/organizations — cooperativas y unión, con sus centros de acopio. */
router.get('/', authenticate, async (_req: Request, res: Response) => {
  const organizations = await OrganizationsService.listOrganizations();
  successResponse(res, { organizations });
});

export default router;
