import type { PrismaService } from '../prisma/prisma.service';
import type { UpdateUserInput } from './dto/update-user.dto';

/** Data access for authentication: users, their role assignments, and sessions. */
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Looks up a user by username — the sole login identifier for every role. */
  findUserByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
      include: {
        // `createdAt: 'asc'` makes the "primary" role assignment (the first
        // entry, used by issueTokens/getProfile) the earliest-assigned one
        // instead of an unspecified Prisma row order.
        userRoles: {
          where: { status: 'ACTIVE', isDeleted: false },
          orderBy: { createdAt: 'asc' },
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
          orderBy: { createdAt: 'asc' },
          include: { role: true },
        },
      },
    });
  }

  /**
   * Same as {@link findUserById}, additionally including the primary
   * project's name (via each active role's `project` relation) and the
   * caller's Sakhi profile (if any — only SAKHI-role users have one). Used
   * by `GET /me`, which needs project name / employee code / masked bank
   * account beyond the base profile fields.
   */
  findUserByIdWithProfile(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      include: {
        userRoles: {
          where: { status: 'ACTIVE', isDeleted: false },
          orderBy: { createdAt: 'asc' },
          include: { role: true, project: true },
        },
        sakhiProfile: true,
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

  /**
   * Records the successful login and creates the new session in one
   * round-trip instead of two sequential ones — each query pays the full
   * network latency to the database, so batching independent writes here
   * matters for login latency (see `AuthService.login`).
   */
  recordSuccessfulLoginAndCreateSession(
    userId: string,
    sessionData: {
      userId: string;
      refreshTokenHash: string;
      issuedAt: Date;
      expiresAt: Date;
      ipAddress: string | null;
    },
  ) {
    return this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { failedLoginCount: 0, lastLoginAt: new Date() },
      }),
      this.prisma.userSession.create({ data: sessionData }),
    ]);
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

  /** Returns null if `id` doesn't exist or is soft-deleted; caller maps that to a 404. */
  async updateUser(id: string, data: UpdateUserInput) {
    const existing = await this.prisma.user.findFirst({ where: { id, isDeleted: false } });
    if (!existing) return null;

    return this.prisma.user.update({ where: { id }, data });
  }
}
