import type { PrismaService } from '../prisma/prisma.service';

/** Data access for authentication: users, their role assignments, and sessions. */
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  findUserByMobileNumber(mobileNumber: string) {
    return this.prisma.user.findUnique({
      where: { mobileNumber },
      include: {
        userRoles: {
          where: { status: 'ACTIVE', isDeleted: false },
          include: { role: true },
        },
      },
    });
  }

  findUserById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          where: { status: 'ACTIVE', isDeleted: false },
          include: { role: true },
        },
      },
    });
  }

  incrementFailedLoginCount(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
    });
  }

  recordSuccessfulLogin(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: 0, lastLoginAt: new Date() },
    });
  }

  createSession(data: {
    userId: string;
    refreshTokenHash: string;
    issuedAt: Date;
    expiresAt: Date;
    ipAddress: string | null;
  }) {
    return this.prisma.userSession.create({ data });
  }

  findActiveSessionByRefreshTokenHash(refreshTokenHash: string) {
    return this.prisma.userSession.findUnique({
      where: { refreshTokenHash },
    });
  }

  revokeSession(sessionId: string) {
    return this.prisma.userSession.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
  }

  revokeSessionByRefreshTokenHash(refreshTokenHash: string) {
    return this.prisma.userSession.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
