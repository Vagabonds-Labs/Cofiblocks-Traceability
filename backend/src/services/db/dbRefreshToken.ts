import { StaffRole } from '@prisma/client';
import { prisma } from "@/lib/prisma";

export interface CreateRefreshTokenEntry {
    token: string;
    userId: string;
    sessionId: string;
    expiresAt: Date;
}

export interface RefreshTokenWithRelationsEntry {
    id: string;
    token: string;
    userId: string;
    sessionId: string | null;
    expiresAt: Date;
    createdAt: Date;
    user: {
        id: string;
        name: string | null;
        email: string | null;
        walletAddress: string | null;
        walletProvider: string | null;
        role: StaffRole | null;
        organizationId: string | null;
        isAdmin: boolean;
        createdAt: Date;
        updatedAt: Date;
    };
    session: {
        id: string;
        userId: string;
        ipAddress: string | null;
        userAgent: string | null;
        deviceInfo: string | null;
        isActive: boolean;
        lastActivity: Date;
        createdAt: Date;
        expiresAt: Date;
    } | null;
}

export class DbRefreshToken {
    async createRefreshToken(data: CreateRefreshTokenEntry): Promise<void> {
        await prisma.refreshToken.create({
            data: {
                token: data.token,
                userId: data.userId,
                sessionId: data.sessionId,
                expiresAt: data.expiresAt,
            },
        });
    }

    async updateRefreshTokenSession(refreshToken: string, sessionId: string): Promise<void> {
        await prisma.refreshToken.update({
            where: { token: refreshToken },
            data: { sessionId: sessionId },
          });
    }

    async deleteRefreshTokensBySessionId(sessionId: string): Promise<void> {
        await prisma.refreshToken.deleteMany({
            where: {
                sessionId,
            },
        });
    }

    async deleteRefreshTokenByToken(token: string): Promise<void> {
        await prisma.refreshToken.deleteMany({
            where: {
                token,
            },
        });
    }

    async deleteRefreshTokensByUserId(userId: string): Promise<void> {
        await prisma.refreshToken.deleteMany({
            where: { userId },
        });
    }

    async deleteExpiredRefreshTokens(): Promise<void> {
        await prisma.refreshToken.deleteMany({
            where: {
                expiresAt: {
                    lt: new Date(),
                },
            },
        });
    }

    async findRefreshTokenWithRelations(token: string): Promise<RefreshTokenWithRelationsEntry | null> {
        const tokenRecord = await prisma.refreshToken.findUnique({
            where: { token },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        walletAddress: true,
                        walletProvider: true,
                        role: true,
                        organizationId: true,
                        isAdmin: true,
                        createdAt: true,
                        updatedAt: true,
                    },
                },
                session: {
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
                },
            },
        });

        return tokenRecord as RefreshTokenWithRelationsEntry | null;
    }
}