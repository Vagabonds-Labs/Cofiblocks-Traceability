import jwt from 'jsonwebtoken';
import { TokenPayload, TokenPair } from './types/Auth';

/** Largo mínimo de cada secreto: 32 bytes en hex o base64 superan este piso. */
const MIN_SECRET_LENGTH = 32;

/**
 * Lee y valida los secretos de las sesiones.
 *
 * Antes, si faltaban, se usaban cadenas fijas del repositorio: cualquiera que
 * las leyera podía firmar un token con `is_admin: true`. Ahora el backend no
 * arranca sin secretos propios, largos y distintos entre sí.
 */
export function readJwtSecrets(env: NodeJS.ProcessEnv = process.env): { access: string; refresh: string } {
  const access = env.JWT_ACCESS_SECRET ?? '';
  const refresh = env.JWT_REFRESH_SECRET ?? '';
  const problems: string[] = [];
  for (const [name, value] of [['JWT_ACCESS_SECRET', access], ['JWT_REFRESH_SECRET', refresh]] as const) {
    if (!value) problems.push(`${name} is not set`);
    else if (value.length < MIN_SECRET_LENGTH) problems.push(`${name} must be at least ${MIN_SECRET_LENGTH} characters`);
    else if (/change-in-production|your-.*-secret/i.test(value)) problems.push(`${name} still has the example value`);
  }
  if (access && access === refresh) problems.push('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different');
  if (problems.length > 0) {
    throw new Error(
      `Invalid session secrets: ${problems.join('; ')}. Generate each one with: openssl rand -hex 32`
    );
  }
  return { access, refresh };
}

export class JwtService {
  private readonly accessTokenSecret: string;
  private readonly refreshTokenSecret: string;
  private readonly accessTokenExpiry: string;
  private readonly refreshTokenExpiry: string;

  constructor() {
    const secrets = readJwtSecrets();
    this.accessTokenSecret = secrets.access;
    this.refreshTokenSecret = secrets.refresh;
    this.accessTokenExpiry = process.env.JWT_ACCESS_EXPIRY || '10m'; // 10 minutes
    this.refreshTokenExpiry = process.env.JWT_REFRESH_EXPIRY || '7d'; // 7 days
  }

  /**
   * Generate access token (short-lived)
   *
   * Lleva el `sessionId`: el middleware comprueba en cada pedido que esa sesión
   * siga activa, así cerrar sesión o revocarla corta el acceso al instante.
   */
  generateAccessToken(payload: TokenPayload & { sessionId: string }): string {
    return jwt.sign(
      {
        userId: payload.userId,
        walletAddress: payload.walletAddress,
        is_admin: payload.is_admin,
        role: payload.role,
        organization_id: payload.organization_id,
        sessionId: payload.sessionId,
        type: 'access',
      },
      this.accessTokenSecret,
      {
        expiresIn: this.accessTokenExpiry,
      } as jwt.SignOptions
    );
  }

  /**
   * Generate refresh token as JWT (long-lived, stored in DB for revocation)
   */
  generateRefreshToken(payload: TokenPayload & { sessionId?: string }): string {
    return jwt.sign(
      {
        userId: payload.userId,
        walletAddress: payload.walletAddress,
        is_admin: payload.is_admin,
        role: payload.role,
        organization_id: payload.organization_id,
        sessionId: payload.sessionId,
        type: 'refresh',
      },
      this.refreshTokenSecret,
      {
        expiresIn: this.refreshTokenExpiry,
      } as jwt.SignOptions
    );
  }

  /**
   * Generate both access and refresh tokens
   */
  generateTokenPair(payload: TokenPayload & { sessionId: string }): TokenPair {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
    };
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token: string): (TokenPayload & { sessionId?: string }) | null {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret) as jwt.JwtPayload;
      
      if (decoded.type !== 'refresh') {
        return null;
      }

      return {
        userId: decoded.userId as string,
        walletAddress: decoded.walletAddress as string,
        is_admin: decoded.is_admin as boolean,
        role: (decoded.role as string | null) ?? null,
        organization_id: (decoded.organization_id as string | null) ?? null,
        sessionId: decoded.sessionId as string | undefined,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token: string): (TokenPayload & { sessionId: string }) | null {
    try {
      const decoded = jwt.verify(token, this.accessTokenSecret) as jwt.JwtPayload;

      // Los tokens emitidos antes de este cambio no traen sesión: se rechazan y
      // el usuario vuelve a entrar.
      if (decoded.type !== 'access' || typeof decoded.sessionId !== 'string') {
        return null;
      }

      return {
        userId: decoded.userId as string,
        walletAddress: decoded.walletAddress as string,
        is_admin: decoded.is_admin as boolean,
        role: (decoded.role as string | null) ?? null,
        organization_id: (decoded.organization_id as string | null) ?? null,
        sessionId: decoded.sessionId,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get refresh token expiry date
   */
  getRefreshTokenExpiryDate(): Date {
    const expiryDays = parseInt(this.refreshTokenExpiry.replace('d', '')) || 7;
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + expiryDays);
    return expiryDate;
  }
}

