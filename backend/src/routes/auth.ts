import { Router, Request, Response } from 'express';

import { authenticate, validate } from '@/middleware';
import {
  refreshTokenSchema,
  logoutSchema,
  getSessionsSchema,
  revokeSessionSchema,
  registerWalletSchema,
  nonceSchema,
  type RegisterWalletRequest,
} from '@/schemas/userSchemas';
import { HttpException } from '@/exceptions/HttpException';
import { getClientIp, setRefreshTokenCookie, clearRefreshTokenCookie, getRefreshToken, setAccessTokenCookie, clearAccessTokenCookie } from '@/utils/authUtils';
import * as AuthService from '@/services/app/AuthService';
import * as NonceService from '@/services/app/NonceService';
import * as UsersService from '@/services/app/UsersService';
import * as NotificationsService from '@/services/app/NotificationService';
import * as OnChainAccountsService from '@/services/onchain/OnChainAccountsService';
import { successResponse } from '@/utils/formatting';

const router = Router();

/**
 * POST /api/auth/nonce
 *
 * Emite el nonce que hay que firmar para entrar. Vence en 5 minutos y se
 * consume una sola vez: el backend rechaza cualquier firma cuyo nonce no haya
 * salido de acá. Antes lo generaba el cliente y nunca se invalidaba.
 */
router.post('/nonce', validate(nonceSchema), async (req: Request, res: Response, next) => {
  const { address } = req.body;
  const issued = await NonceService.issueNonce(address);
  successResponse(res, issued, 'Nonce issued successfully', 201);
});


router.post('/refresh', validate(refreshTokenSchema), async (req: Request, res: Response, next) => {
    const refreshToken = getRefreshToken(req);
    if (!refreshToken) {
      throw new HttpException(400, "Refresh token is required");
    }
    const { accessToken } = await AuthService.refreshAccessToken(refreshToken);
  
    // Set access token as HttpOnly cookie
    setAccessTokenCookie(res, accessToken);
  
    // Return success response without access token in payload
    successResponse(res, null, 'Access token refreshed successfully', 200);
  });
  
  
  router.post('/logout', authenticate, validate(logoutSchema), async (req: Request, res: Response, next) => {
    const refreshToken = getRefreshToken(req);
    if (refreshToken) {
      await AuthService.revokeRefreshToken(refreshToken);
    }
  
    clearRefreshTokenCookie(res);
    clearAccessTokenCookie(res);
    successResponse(res, null, 'Logged out successfully', 200);
  });


router.get('/me', authenticate, async (req: Request, res: Response, next) => {
    const userId = req.user!.userId;
    const user = await UsersService.getUserById(userId);
    if (!user) {
      throw new HttpException(404, 'User not found', 'USER_NOT_FOUND');
    }
  
    successResponse(res, { user }, 'User information retrieved successfully', 200);
  });


router.get('/sessions', authenticate, validate(getSessionsSchema), async (req: Request, res: Response, next) => {
    const userId = req.user!.userId;
    const sessions = await AuthService.getUserSessions(userId);
    successResponse(res, { sessions }, 'Sessions retrieved successfully', 200);
  });

router.delete(
    '/sessions/:sessionId', 
    authenticate, 
    validate(revokeSessionSchema), 
    async (req: Request, res: Response, next) => 
{
    const { sessionId } = req.params;
    const userId = req.user!.userId;
  
    // Verify session belongs to user
    const session = await AuthService.getSessionByRefreshToken(sessionId);
    if (session && session.userId !== userId) {
      throw new HttpException(403, 'You can only revoke your own sessions', 'FORBIDDEN');
    }
    await AuthService.revokeSession(sessionId);
    successResponse(res, null, 'Session revoked successfully', 200);
  });
  

  router.delete('/sessions', authenticate, async (req: Request, res: Response, next) => {
    const userId = req.user!.userId;
    await AuthService.revokeAllUserSessions(userId);
  
    // Clear refresh token and access token cookies
    clearRefreshTokenCookie(res);
    clearAccessTokenCookie(res);
    successResponse(res, null, 'All sessions revoked successfully', 200);
  });
  
  router.post('/register_wallet', validate(registerWalletSchema), async (req: Request, res: Response, next) => {
    const { address, signature, nonce, provider }: RegisterWalletRequest = req.body;
  
    // Get session data from request
    const sessionData = {
        ipAddress: getClientIp(req),
        userAgent: req.headers['user-agent'],
        deviceInfo: AuthService.getDeviceInfo(req.headers['user-agent']),
    };
    // Register user with wallet
    const { user, isNewUser } = await UsersService.registerUser(
      {
        walletAddress: address,
        walletProvider: provider ?? 'stellar',
        signature: signature,
        nonce,
      }
    );

    const { tokens } = await AuthService.createSession(user, sessionData);
  
    if (isNewUser) {
      await NotificationsService.pushInfoNotification(user.id, "welcome_message");
    }

    // Las transacciones que firma el usuario lo usan como source account, así
    // que la cuenta tiene que existir en la red. Se crea en segundo plano para
    // no demorar el login; si falla, se reintenta en el próximo.
    OnChainAccountsService.ensureAccount(address).catch((error) => {
      req.log.error({ error, address }, 'Could not create the user account on chain');
    });
    
    setRefreshTokenCookie(res, tokens.refreshToken);
    setAccessTokenCookie(res, tokens.accessToken);
  
    // Return user data (tokens are in cookies)
    // Use 200 for login, 201 for new registration
    const statusCode = isNewUser ? 201 : 200;
    const message = isNewUser ? 'Wallet registered successfully' : 'Wallet login successful';

    successResponse(res, { user }, message, statusCode);
  });

export default router;