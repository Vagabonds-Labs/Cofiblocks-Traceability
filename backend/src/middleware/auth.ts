import { Request, Response, NextFunction } from 'express';
import { JwtService } from '../services/app/JwtService';
import { HttpException } from '../exceptions/HttpException';
import * as AuthService from '../services/app/AuthService';
import { getAccessToken } from '../utils/authUtils';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        sessionId: string;
        walletAddress: string;
        role: string | null;
        organization_id: string | null;
        is_admin: boolean;
      };
    }
  }
}

const jwtService = new JwtService();

/**
 * The request's user, or `null` if the token is not valid.
 *
 * The token's signature only proves who the user is and which session they
 * signed in with. Permissions (admin, role, organization) are read from the
 * database on every request, and the session has to still be active: logging
 * out, revoking the session, deleting the user or removing their admin rights
 * cuts access immediately. Previously permissions came from the token and
 * stayed valid until it expired.
 */
async function resolveUser(token: string): Promise<Request['user'] | null> {
  const payload = jwtService.verifyAccessToken(token);
  if (!payload) return null;

  const user = await AuthService.getActiveSessionUser(payload.sessionId, payload.userId);
  if (!user) return null;

  return {
    userId: user.id,
    sessionId: payload.sessionId,
    walletAddress: user.walletAddress ?? '',
    role: user.role,
    organization_id: user.organizationId,
    is_admin: user.isAdmin,
  };
}

/**
 * Authentication middleware
 * Verifies the access token, checks that its session is still active and
 * attaches the user's current permissions to the request.
 */
export const authenticate = async (req: Request, _: Response, next: NextFunction) => {
  try {
    // Get token from cookie or Authorization header (cookie takes precedence)
    const token = getAccessToken(req);

    if (!token) {
      throw new HttpException(401, 'Access token is missing', 'MISSING_TOKEN');
    }

    const user = await resolveUser(token);
    if (!user) {
      throw new HttpException(401, 'Invalid or expired token', 'INVALID_TOKEN');
    }

    req.user = user;
    next();
  } catch (error) {
    // If it's already an HttpException, pass it through
    if (error instanceof HttpException) {
      return next(error);
    }
    next(new HttpException(401, 'Authentication failed', 'AUTH_FAILED', undefined, error));
  }
};

/**
 * Optional authentication middleware
 * Attaches user info if token is present, but doesn't fail if missing
 */
export const optionalAuthenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const token = getAccessToken(req);

    if (token) {
      const user = await resolveUser(token);
      if (user) req.user = user;
    }

    next();
  } catch (error) {
    // Silently continue if optional auth fails
    next();
  }
};

/**
 * Admin authorization middleware
 * Checks if the authenticated user is an admin
 * Must be used after authenticate middleware
 */
export const requireAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || !req.user.userId) {
    throw new HttpException(401, 'Authentication required', 'AUTH_REQUIRED');
  }

  if (!req.user.is_admin) {
    throw new HttpException(403, 'Admin access required', 'ADMIN_REQUIRED');
  }
  next();
};

/**
 * Requires the user to have one of the pilot roles.
 * Used after `authenticate`. Admins always pass.
 */
export const requireRole =
  (...roles: string[]) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !req.user.userId) {
      throw new HttpException(401, 'Authentication required', 'AUTH_REQUIRED');
    }
    if (req.user.is_admin) return next();
    if (!req.user.role || !roles.includes(req.user.role)) {
      throw new HttpException(403, 'Your role does not allow this action', 'ROLE_REQUIRED');
    }
    next();
  };
