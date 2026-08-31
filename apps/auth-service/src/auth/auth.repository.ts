import type { PrismaService } from '../prisma/prisma.service';

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

  /**
   * Minimal lookup for service-to-service display-name resolution (e.g.
   * media-service enriching an `uploadedByUserId`) — selects only what's
   * needed rather than the full profile the other `findUserBy*` methods pull.
   */
  findDisplayNameById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, displayName: true, isDeleted: true },
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

  /** Looks up a machine identity by its client id — the service-token counterpart of findUserByUsername. */
  findServiceAccountByClientId(clientId: string) {
    return this.prisma.serviceAccount.findUnique({ where: { clientId } });
  }

  /**
   * Creates the user and their initial role assignment atomically. When
   * `sakhiProfile` is supplied (roleCode SAKHI — see AuthService.createUser),
   * the sakhi_profiles row is created in the same transaction, so a SAKHI
   * user can never exist without one: previously POST /users only wrote
   * users/user_roles, leaving a newly-created SAKHI unable to be found by
   * any endpoint that resolves identity via sakhi_profiles (e.g.
   * GET /sakhi/:id/dashboard) until a follow-up PATCH supplied a
   * profile field. Mirrors updateUserTransaction's `create` branch.
   */
  createUserWithRole(data: {
    username: string;
    mobileNumber: string;
    passwordHash: string;
    displayName: string;
    email: string | null;
    roleId: string;
    projectId: string | null;
    geographyUnitId: string | null;
    sakhiProfile?: { primaryProjectId: string; phoneNumber: string };
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
      if (data.sakhiProfile) {
        await tx.sakhiProfile.create({
          data: {
            userId: user.id,
            primaryProjectId: data.sakhiProfile.primaryProjectId,
            phoneNumber: data.sakhiProfile.phoneNumber,
            activeFrom: new Date(),
          },
        });
      }
      return user;
    });
  }

  findProjectById(projectId: string) {
    return this.prisma.project.findFirst({ where: { projectId, isDeleted: false } });
  }

  /**
   * Finds the user's currently-active `user_roles` row for `roleCode` — the
   * row {@link updateUserTransaction} will update. Returns null if the user
   * holds no such active role (caller maps that to a 404).
   */
  findActiveUserRole(userId: string, roleCode: string) {
    return this.prisma.userRole.findFirst({
      where: { userId, status: 'ACTIVE', isDeleted: false, role: { roleCode } },
    });
  }

  findSakhiProfileByUserId(userId: string) {
    return this.prisma.sakhiProfile.findFirst({ where: { userId, isDeleted: false } });
  }

  /**
   * Reactivates a deactivated user's account (Quick Response's DATA_RESTORE
   * card, approved) — flips status back to ACTIVE. Only updates a row whose
   * status is currently one of the deactivated states; a DELETED account is
   * deliberately excluded — that's a distinct, more serious state a bare
   * reactivation must never silently reverse. updateMany's affected count
   * (rather than a separate read-then-write) is the concurrency guard: if
   * status already changed between the caller's findUserById and this call,
   * the count comes back 0 and the service turns that into a 409 instead of
   * silently overwriting a since-changed account.
   */
  async reactivateUser(userId: string): Promise<boolean> {
    const result = await this.prisma.user.updateMany({
      where: { id: userId, isDeleted: false, status: { in: ['INACTIVE', 'LOCKED', 'PAUSED'] } },
      data: { status: 'ACTIVE' },
    });
    return result.count > 0;
  }

  /**
   * Applies the `users`/`user_roles`/`sakhi_profiles` portions of an update,
   * and — when `revokeSessions` is set — the session revocation that must
   * accompany a username/password change, all in one transaction: either
   * everything requested lands (including revocation), or none of it does.
   * Revocation is folded in here rather than issued as a separate call after
   * this transaction commits, so a credential change can never land without
   * its accompanying forced-logout also landing.
   *
   * `sakhiProfile` is either `{ id, data }` (update an existing row — id
   * pre-resolved by the caller, which already validated it exists) or
   * `{ create, data }` (no existing profile — create one; `create` carries
   * the required `userId`/`primaryProjectId`/`phoneNumber`/`activeFrom`
   * pre-validated by the caller, so this only ever writes to rows known to
   * exist or known to be creatable).
   * `userRoleId` is likewise pre-resolved by the caller.
   */
  updateUserTransaction(
    id: string,
    fields: {
      user: Record<string, unknown>;
      userRole?: { id: string; data: Record<string, unknown> };
      sakhiProfile?:
        | { id: string; data: Record<string, unknown> }
        | {
            create: {
              userId: string;
              primaryProjectId: string;
              phoneNumber: string;
              activeFrom: Date;
            };
            data: Record<string, unknown>;
          };
      revokeSessions?: boolean;
    },
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (Object.keys(fields.user).length > 0) {
        await tx.user.update({ where: { id }, data: fields.user });
      }
      if (fields.userRole) {
        await tx.userRole.update({ where: { id: fields.userRole.id }, data: fields.userRole.data });
      }
      if (fields.sakhiProfile) {
        if ('create' in fields.sakhiProfile) {
          await tx.sakhiProfile.create({
            data: { ...fields.sakhiProfile.create, ...fields.sakhiProfile.data },
          });
        } else {
          await tx.sakhiProfile.update({
            where: { id: fields.sakhiProfile.id },
            data: fields.sakhiProfile.data,
          });
        }
      }
      if (fields.revokeSessions) {
        await tx.userSession.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return tx.user.findUnique({
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
    });
  }
}
