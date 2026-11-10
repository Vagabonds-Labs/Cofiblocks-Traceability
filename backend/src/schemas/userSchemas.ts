import { z } from 'zod';

export const STAFF_ROLES = [
  'COLLECTOR',
  'COMMITTEE_MEMBER',
  'INDUSTRY_MANAGER',
  'STORE_KEEPER',
  'EXPORT_MANAGER',
] as const;

/**
 * Refresh token schema
 */
export const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().optional(), // Optional because it can come from cookie
  }),
});

/**
 * Logout schema
 */
// Logout closes the access token's session; it does not read any refresh token.
export const logoutSchema = z.object({
  body: z.object({}).passthrough(),
});

/**
 * Get sessions schema (query params for pagination, etc.)
 */
export const getSessionsSchema = z.object({
  query: z.object({
    page: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 1))
      .pipe(z.number().int().min(1)),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 10))
      .pipe(z.number().int().min(1).max(100)),
  }),
});

/**
 * Revoke session schema
 */
export const revokeSessionSchema = z.object({
  params: z.object({
    sessionId: z.string().uuid('Invalid session ID format'),
  }),
});

/**
 * Register wallet schema
 */
export const registerWalletSchema = z.object({
  body: z.object({
    // Classic Stellar account. Contract accounts (`C…`) are not supported in v1.
    address: z
      .string()
      .regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address (expected a classic G… account)'),
    // SEP-53 signature in base64, not Starknet's (r, s) pair.
    signature: z
      .string()
      .min(1, 'Signature is required'),
    // Must come from POST /api/auth/nonce.
    nonce: z
      .string()
      .min(1, 'Nonce is required'),
    // What the user signed with: Cavos (Telegram or email) or a Stellar
    // wallet. It changes how the signature is verified (see `registerUser`)
    // and tells the web app what to sign with later.
    provider: z.enum(['cavos', 'stellar']).optional(),
    // Cavos only: the "control key" that signed, if it is not the account itself.
    signer: z
      .string()
      .regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address (expected a classic G… account)')
      .optional(),
  }),
});

export const nonceSchema = z.object({
  body: z.object({
    address: z
      .string()
      .regex(/^G[A-Z2-7]{55}$/, 'Invalid Stellar address (expected a classic G… account)')
      .optional(),
  }),
});

/**
 * Update user schema
 * At least one field (name or email) must be provided
 */
export const updateUserSchema = z.object({
  body: z.object({
    name: z
      .string()
      .min(5, 'Name must be at least 5 characters long')
      .max(25, 'Name must be less than 25 characters')
      .trim()
      .optional(),
      email: z
      .string()
      .email('Invalid email format')
      .toLowerCase()
      .trim()
      .optional(),    
  }).refine(
    (data) => data.name !== undefined || data.email !== undefined,
    { message: 'At least one field (name or email) must be provided' }
  ),
});

/**
 * Get all users schema (for admin)
 * Supports filtering and pagination
 */
export const getAllUsersSchema = z.object({
  query: z.object({
    role: z.enum(STAFF_ROLES).optional(),
    organization_id: z.string().uuid().optional(),
    is_admin: z
      .string()
      .transform((val) => val === 'true')
      .optional(),
    email: z.string().optional(),
    name: z.string().optional(),
    wallet_address: z.string().optional(),
    wallet_provider: z.string().optional(),
    limit: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 50))
      .pipe(z.number().int().min(1).max(100)),
    offset: z
      .string()
      .optional()
      .transform((val) => (val ? parseInt(val, 10) : 0))
      .pipe(z.number().int().min(0)),
  }),
});

/**
 * Update admin status schema (admin only)
 */
export const updateAdminStatusSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID format'),
  }),
  body: z.object({
    isAdmin: z.boolean(),
  }),
});

/**
 * Delete user schema (admin only)
 */
export const deleteUserSchema = z.object({
  params: z.object({
    userId: z.string().uuid('Invalid user ID format'),
  }),
});

export type RefreshTokenRequest = z.infer<typeof refreshTokenSchema>['body'];
export type GetSessionsQuery = z.infer<typeof getSessionsSchema>['query'];
export type RegisterWalletRequest = z.infer<typeof registerWalletSchema>['body'];
export type UpdateUserRequest = z.infer<typeof updateUserSchema>['body'];
export type GetAllUsersQuery = z.infer<typeof getAllUsersSchema>['query'];
export type UpdateAdminStatusRequest = z.infer<typeof updateAdminStatusSchema>['body'];
export type DeleteUserParams = z.infer<typeof deleteUserSchema>['params'];

