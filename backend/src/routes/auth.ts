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
import * as FaucetService from '@/services/onchain/FaucetService';
import { successResponse } from '@/utils/formatting';

const router = Router();

/**
 * POST /api/auth/nonce
 *
 * Issues the nonce that has to be signed to sign in. It expires in 5 minutes
 * and can be used only once: the backend rejects any signature whose nonce did
 * not come from here. Previously the client generated it and it was never
 * invalidated.
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
    // Close the session of the access token, already validated by
    // `authenticate`. Previously it used whatever refresh token the client
    // sent: without one, the session stayed open; with another session's,
    // it closed that one instead of its own.
    await AuthService.revokeSession(req.user!.sessionId, req.user!.userId);

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

    // Delete only if the session belongs to the user (ID and owner in the same query).
    await AuthService.revokeSession(sessionId, userId);

    // If they revoked the session they are calling from, clear their cookies too.
    if (sessionId === req.user!.sessionId) {
      clearRefreshTokenCookie(res);
      clearAccessTokenCookie(res);
    }
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
    const { address, signature, nonce, provider, signer }: RegisterWalletRequest = req.body;
  
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
        signer,
        nonce,
      }
    );

    const { tokens } = await AuthService.createSession(user, sessionData);
  
    if (isNewUser) {
      await NotificationsService.pushInfoNotification(user.id, "welcome_message");
    }

    // The transactions the user signs use them as the source account, so the
    // account has to exist on the network. On testnet Friendbot creates it
    // (without spending the backend's balance), in the background so login is
    // not delayed; if it fails, it is retried on the next login.
    //
    // NOT for Cavos accounts: Cavos creates them with its own data and signers.
    // If we created one first, Cavos would see it as "deployed" without its
    // data and leave the user waiting to approve their device.
    if (provider !== 'cavos') {
      OnChainAccountsService.ensureAccount(address)
        .then((hash) => (hash ? FaucetService.recordFriendbotFunding(user.id, hash) : undefined))
        .catch((error) => {
          req.log.error({ error, address }, 'Could not create the user account on chain');
        });
    }
    
    setRefreshTokenCookie(res, tokens.refreshToken);
    setAccessTokenCookie(res, tokens.accessToken);
  
    // Return user data (tokens are in cookies)
    // Use 200 for login, 201 for new registration
    const statusCode = isNewUser ? 201 : 200;
    const message = isNewUser ? 'Wallet registered successfully' : 'Wallet login successful';

    successResponse(res, { user }, message, statusCode);
  });

export default router;