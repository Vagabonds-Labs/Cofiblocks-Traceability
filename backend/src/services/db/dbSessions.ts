import { prisma } from '@/lib/prisma';

export interface CreateSessionEntry {
    userId: string;
    ipAddress?: string;
    userAgent?: string;
    deviceInfo?: string;
    expiresAt: Date;
  }

export interface SessionEntry {
    id: string;
    userId: string;
    ipAddress: string | null;
    userAgent: string | null;
    deviceInfo: string | null;
    isActive: boolean;
    lastActivity: Date;
    createdAt: Date;
    expiresAt: Date;
  }

export interface ActiveSessionUser {
    id: string;
    walletAddress: string | null;
    isAdmin: boolean;
    role: string | null;
    organizationId: string | null;
}

export class DbSessions {
    async createSession(data: CreateSessionEntry): Promise<SessionEntry> {
        const session = await prisma.session.create({
            data: data,
            select: {
              id: true,
              userId: true,
              ipAddress: true,
              userAgent: true,
              deviceInfo: true,
              isActive: true,
              lastActivity: true,
              createdAt: true,
              expiresAt: true,
            },
          });

        return session;
    }

    /**
     * Sesión activa y vigente de un usuario, con los permisos actuales del
     * usuario. `null` si la sesión no existe, es de otro usuario, se cerró o
     * venció.
     */
    async findActiveSessionWithUser(sessionId: string, userId: string): Promise<ActiveSessionUser | null> {
        const session = await prisma.session.findFirst({
            where: {
                id: sessionId,
                userId,
                isActive: true,
                expiresAt: { gt: new Date() },
            },
            select: {
                user: {
                    select: {
                        id: true,
                        walletAddress: true,
                        isAdmin: true,
                        role: true,
                        organizationId: true,
                    },
                },
            },
        });

        return session?.user ?? null;
    }

    /**
     * Borra una sesión y su refresh token, sólo si es del usuario indicado.
     * Devuelve `false` si no había una sesión así: el usuario no puede tocar
     * sesiones ajenas.
     */
    async deleteUserSession(sessionId: string, userId: string): Promise<boolean> {
        const [, deleted] = await prisma.$transaction([
            prisma.refreshToken.deleteMany({ where: { sessionId, userId } }),
            prisma.session.deleteMany({ where: { id: sessionId, userId } }),
        ]);
        return deleted.count > 0;
    }

    async getUserSessions(userId: string): Promise<SessionEntry[]> {
        const sessions = await prisma.session.findMany({
            where: {
                userId,
                isActive: true,
                expiresAt: {
                    gt: new Date(), // Only non-expired sessions
                },
            },
            orderBy: {
                lastActivity: 'desc',
            },
            select: {
                id: true,
                userId: true,
                ipAddress: true,
                userAgent: true,
                deviceInfo: true,
                isActive: true,
                lastActivity: true,
                createdAt: true,
                expiresAt: true,
            },
        });

        return sessions;
    }

    async updateLastActivity(sessionId: string): Promise<void> {
        await prisma.session.update({
            where: { id: sessionId },
            data: {
                lastActivity: new Date(),
            },
        });
    }

    async deleteSession(sessionId: string): Promise<void> {
        await prisma.session.delete({
            where: { id: sessionId },
        });
    }

    async markAllSessionsInactive(userId: string): Promise<void> {
        await prisma.session.updateMany({
            where: { userId },
            data: { isActive: false },
        });
    }

    async cleanupExpiredSessions(): Promise<number> {
        const result = await prisma.session.updateMany({
            where: {
                expiresAt: {
                    lt: new Date(),
                },
                isActive: true,
            },
            data: {
                isActive: false,
            },
        });

        return result.count;
    }
}