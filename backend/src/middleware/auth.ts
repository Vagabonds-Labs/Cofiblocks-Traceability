import { Request, Response, NextFunction } from 'express';
import { JwtService } from '../services/app/JwtService';
import { HttpException } from '../exceptions/HttpException';
import { prisma } from '../lib/prisma';
import { getAccessToken } from '../utils/authUtils';

// Extend Express Request to include user info
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
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
 * Authentication middleware
 * Verifies JWT access token and attaches user info to request
 */
export const authenticate = async (req: Request, _: Response, next: NextFunction) => {
  try {
    // Get token from cookie or Authorization header (cookie takes precedence)
    const token = getAccessToken(req);

    if (!token) {
      throw new HttpException(401, 'Access token is missing', 'MISSING_TOKEN');
    }

    // Verify token
    const payload = jwtService.verifyAccessToken(token);
    if (!payload) {
      throw new HttpException(401, 'Invalid or expired token', 'INVALID_TOKEN');
    }

    // Attach user info to request
    req.user = {
      userId: payload.userId,
      walletAddress: payload.walletAddress,
      role: payload.role,
      organization_id: payload.organization_id,
      is_admin: payload.is_admin
    };
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
      const payload = jwtService.verifyAccessToken(token);

      if (payload) {
        req.user = {
          userId: payload.userId,
          walletAddress: payload.walletAddress,
          role: payload.role,
          organization_id: payload.organization_id,
          is_admin: payload.is_admin,
        };
      }
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
 * Exige que el usuario tenga uno de los roles del piloto.
 * Se usa después de `authenticate`. Los admins pasan siempre.
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
