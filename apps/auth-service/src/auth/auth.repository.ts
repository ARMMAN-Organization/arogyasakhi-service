import type { PrismaService } from '../prisma/prisma.service';

/** Data access for authentication: users, their role assignments, and sessions. */
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Looks up a user by mobile number or username — login accepts either. */
  findUserByIdentifier(identifier: string) {
    return this.prisma.user.findFirst({
      where: { OR: [{ mobileNumber: identifier }, { username: identifier }] },
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

  findRoleByCode(roleCode: string) {
    return this.prisma.role.findUnique({ where: { roleCode } });
  }

  /** Creates the user and their initial role assignment atomically. */
  createUserWithRole(data: {
    username: string;
    mobileNumber: string;
    passwordHash: string;
    displayName: string;
    email: string | null;
    roleId: string;
    projectId: string | null;
    geographyUnitId: string | null;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          username: data.username,
          mobileNumber: data.mobileNumber,
          passwordHash: data.passwordHash,
          displayName: data.displayName,
          email: data.email,
        },
      });
      await tx.userRole.create({
        data: {
          userId: user.id,
          roleId: data.roleId,
          projectId: data.projectId,
          geographyUnitId: data.geographyUnitId,
          effectiveFrom: new Date(),
        },
      });
      return user;
    });
  }
}
