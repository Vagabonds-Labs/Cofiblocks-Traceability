import { Router, Request, Response } from 'express';

import { authenticate, requireAdmin, validate } from '@/middleware';
import {
  updateUserSchema,
  getAllUsersSchema,
  updateAdminStatusSchema,
  deleteUserSchema,
  type GetAllUsersQuery,
} from '@/schemas/userSchemas';
import { successResponse } from '@/utils/formatting';
import * as UsersService from '@/services/app/UsersService';

const router = Router();


router.get('/', authenticate, requireAdmin, validate(getAllUsersSchema), async (req: Request, res: Response, next) => {
  const query = req.query as unknown as GetAllUsersQuery;

  const result = await UsersService.getAllUsers({
    role: query.role,
    organizationId: query.organization_id,
    isAdmin: query.is_admin,
    email: query.email,
    name: query.name,
    walletAddress: query.wallet_address,
    walletProvider: query.wallet_provider,
    limit: query.limit,
    offset: query.offset,
  });

  successResponse(res, {
    users: result.users,
    total: result.total,
    limit: query.limit,
    offset: query.offset,
  });
});


router.patch('/', authenticate, validate(updateUserSchema), async (req: Request, res: Response, next) => {
  const userId = req.user!.userId;
  const { name, email } = req.body;

  const updatedUser = await UsersService.updateUser(userId, { name, email });

  successResponse(res, {user: updatedUser}, 'User updated successfully', 200);
});


router.patch(
  '/:userId/admin', 
  authenticate,
  requireAdmin, 
  validate(updateAdminStatusSchema), 
  async (req: Request, res: Response, next) => 
{
  const { userId } = req.params;
  const { isAdmin } = req.body;

  const updatedUser = await UsersService.updateAdminStatus(userId, isAdmin);
  successResponse(res, {user: updatedUser}, 'Admin status updated successfully', 200);
});

router.delete('/:userId', authenticate, requireAdmin, validate(deleteUserSchema), async (req: Request, res: Response, next) => {
  const { userId } = req.params;
  await UsersService.deleteUser(userId);
  successResponse(res, null, 'User deleted successfully', 200);
});

export default router;

