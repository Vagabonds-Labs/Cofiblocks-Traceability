import { HttpException } from '@/exceptions/HttpException';

import { JwtService } from './JwtService';
import { DbRefreshToken, DbSessions, SessionEntry, UserEntry } from '@/services/db';
import { TokenPair } from './types';
import { getClientIp } from '@/utils/authUtils';

const jwtService = new JwtService();
const dbRefreshToken = new DbRefreshToken();
const dbSessions = new DbSessions();

export async function refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    // First verify the JWT refresh token
    const decoded = jwtService.verifyRefreshToken(refreshToken);
    if (!decoded) {
      throw new HttpException(401, 'Invalid refresh token');
    }

    // Find refresh token in database to check if it's been revoked
    const tokenRecord = await dbRefreshToken.findRefreshTokenWithRelations(refreshToken);
    if (!tokenRecord) {
      throw new HttpException(401, 'Invalid refresh token');
    }

    // Check if token is expired (double check with DB)
    if (tokenRecord.expiresAt < new Date()) {
      // Delete expired token
      await dbRefreshToken.deleteRefreshTokenByToken(refreshToken);
      throw new HttpException(401, 'Refresh token expired');
    }

    // Every issued session has its refresh token linked. Without a session, or
    // with a closed one, the token is not renewed.
    if (!tokenRecord.sessionId || !tokenRecord.session || !tokenRecord.session.isActive) {
      throw new HttpException(401, 'Session has been revoked');
    }

    await dbSessions.updateLastActivity(tokenRecord.sessionId);

    // Generate new access token
    const accessToken = jwtService.generateAccessToken({
      userId: tokenRecord.userId,
      is_admin: tokenRecord.user.isAdmin,
      role: tokenRecord.user.role,
      organization_id: tokenRecord.user.organizationId,
      walletAddress: tokenRecord.user.walletAddress || '',
      sessionId: tokenRecord.sessionId,
    });

    return { accessToken };
  }

export async function createSession(
  user: UserEntry,
  sessionData?: {
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: string;
  }
): Promise<{ tokens: TokenPair; sessionId: string }> {
  // Create session
  const expiresAt = jwtService.getRefreshTokenExpiryDate();
  const session = await dbSessions.createSession({
    userId: user.id,
    ipAddress: sessionData?.ipAddress,
    userAgent: sessionData?.userAgent,
    deviceInfo: sessionData?.deviceInfo,
    expiresAt,
  });

  // Generate tokens with sessionId included
  const tokens = jwtService.generateTokenPair({
    userId: user.id,
    is_admin: user.isAdmin,
    role: user.role,
    organization_id: user.organizationId,
    walletAddress: user.walletAddress || '',
    sessionId: session.id,
  });

  // Store refresh token with session link
  await dbRefreshToken.createRefreshToken({
    token: tokens.refreshToken,
    userId: user.id,
    sessionId: session.id,
    expiresAt,
  });

  return {
    tokens,
    sessionId: session.id,
  };
}


export async function getUserSessions(userId: string): Promise<SessionEntry[]> {
  return await dbSessions.getUserSessions(userId);
}

/**
 * The user with their current permissions, if the token's session is still
 * active.
 *
 * The middleware checks this on every request instead of trusting the token:
 * that way logging out, revoking the session, deleting the user or removing
 * their admin rights takes effect immediately, without waiting for the access
 * token to expire.
 */
export async function getActiveSessionUser(sessionId: string, userId: string) {
  return await dbSessions.findActiveSessionWithUser(sessionId, userId);
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await dbSessions.markAllSessionsInactive(userId);
  await dbRefreshToken.deleteRefreshTokensByUserId(userId);
}

/**
 * Revokes one of the user's sessions. If the ID is not one of their sessions
 * (someone else's or non-existent) it responds 404 without touching anything.
 */
export async function revokeSession(sessionId: string, userId: string): Promise<void> {
  const deleted = await dbSessions.deleteUserSession(sessionId, userId);
  if (!deleted) {
    throw new HttpException(404, 'Session not found', 'SESSION_NOT_FOUND');
  }
}

export function getDeviceInfo(userAgent: string | undefined): string {
  if (!userAgent) return 'Unknown';

  // Simple device detection
  if (userAgent.includes('Mobile')) {
    if (userAgent.includes('iPhone')) return 'iPhone';
    if (userAgent.includes('Android')) return 'Android';
    return 'Mobile';
  }

  if (userAgent.includes('Tablet')) return 'Tablet';

  // Desktop browsers
  if (userAgent.includes('Chrome')) return 'Chrome';
  if (userAgent.includes('Firefox')) return 'Firefox';
  if (userAgent.includes('Safari')) return 'Safari';
  if (userAgent.includes('Edge')) return 'Edge';

  return 'Desktop';
}
