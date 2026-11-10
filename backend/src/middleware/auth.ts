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
 * Usuario del pedido, o `null` si el token no sirve.
 *
 * La firma del token sólo prueba quién es y en qué sesión entró. Los permisos
 * (admin, rol, organización) se leen de la base en cada pedido, y la sesión
 * tiene que seguir activa: cerrar sesión, revocarla, borrar al usuario o
 * quitarle el admin corta el acceso al instante. Antes los permisos salían del
 * token y seguían valiendo hasta que vencía.
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
