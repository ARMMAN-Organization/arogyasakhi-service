import type { TokenSigner } from '@armman/service-commons';
import {
  conflict,
  notFound,
  forbidden,
  badRequest,
  unauthorized,
  encryptPii,
} from '@armman/service-commons';
import type { AuthRepository } from './auth.repository';
import { hashPassword, verifyPassword } from './password';
import { generateRefreshToken, hashRefreshToken } from './refresh-token';
import { parseDurationMs } from './duration';
import { toUserProfile, type AuthTokens, type CreatedUser, type UserProfile } from './auth.mapper';
import type { LoginInput } from './dto/login.dto';
import type { CreateUserInput } from './dto/create-user.dto';
import type { UpdateUserInput } from './dto/update-user.dto';

// Re-exported so importers of `./auth.service` keep resolving these types;
// their definitions live in auth.mapper.ts.
export type { AuthTokens, CreatedUser, UserProfile } from './auth.mapper';

/** The calling principal's own scope, as carried on their JWT/trusted-identity headers. */
export interface CallerScope {
  readonly id: string;
  readonly roles: string[];
}

/** Prisma unique-constraint violation code (mobileNumber/email/roleCode etc). */
const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

/**
 * The one role that still gets a time-based access-token expiry. Every
 * other role (SAKHI, SUPERVISOR, MANAGER) gets a non-expiring token — see
 * `issueTokens`. A user holding ADMIN alongside any other role is still
 * treated as ADMIN for this check (the more restrictive policy wins). The
 * refresh-token session itself never expires by time for any role — only
 * `/auth/logout` or an admin revocation (`revokedAt`) ends it.
 */
const EXPIRING_ROLE = 'ADMIN';

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly signer: TokenSigner,
    private readonly adminAccessTokenTtl: string,
  ) {}

  async login(input: LoginInput, ipAddress: string | null): Promise<AuthTokens> {
    const user = await this.repository.findUserByUsername(input.username);

    // Same generic failure for "no such user" and "wrong password" — never
    // reveal which one it was.
    if (!user || user.isDeleted || user.status !== 'ACTIVE') {
      if (user) await this.repository.incrementFailedLoginCount(user.id);
      throw unauthorized('Invalid credentials.');
    }

    const passwordMatches = await verifyPassword(user.passwordHash, input.password);
    if (!passwordMatches) {
      await this.repository.incrementFailedLoginCount(user.id);
      throw unauthorized('Invalid credentials.');
    }

    // Batches the "record successful login" write with session creation into
    // one round-trip (see `issueTokens`) instead of two sequential ones —
    // each query is a separate network hop to the database.
    return this.issueTokens(user.id, user.userRoles, ipAddress, { recordLogin: true });
  }

  async refresh(refreshToken: string, ipAddress: string | null): Promise<AuthTokens> {
    const tokenHash = hashRefreshToken(refreshToken);
    const session = await this.repository.findActiveSessionByRefreshTokenHash(tokenHash);

    if (!session || session.revokedAt) {
      throw unauthorized('Invalid or revoked refresh token.');
    }

    const user = await this.repository.findUserById(session.userId);
    if (!user || user.isDeleted || user.status !== 'ACTIVE') {
      throw unauthorized('Invalid or revoked refresh token.');
    }

    // Rotate: revoke the presented token, issue a brand new pair.
    await this.repository.revokeSession(session.id);
    return this.issueTokens(user.id, user.userRoles, ipAddress);
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = hashRefreshToken(refreshToken);
    // Idempotent by design — revoking an already-revoked/non-existent session
    // is a no-op (updateMany matches zero rows), not an error.
    await this.repository.revokeSessionByRefreshTokenHash(tokenHash);
  }

  /**
   * Admin-provisioned account creation (no self-service signup exists per
   * the HLD §4.2 auth flow — only /auth/login, /auth/refresh, /auth/logout,
   * /me are public/self-service endpoints).
   *
   * Who can create whom: ADMIN can create any role (ADMIN, MANAGER,
   * SUPERVISOR, SAKHI); SUPERVISOR can create SAKHI only. The route allows
   * both ADMIN and SUPERVISOR to call this endpoint (requireRoles('ADMIN',
   * 'SUPERVISOR')) — this method enforces the finer-grained restriction on
   * which target roleCode each caller is allowed to assign.
   */
  async createUser(input: CreateUserInput, callerRoles: string[]): Promise<CreatedUser> {
    if (!callerRoles.includes('ADMIN')) {
      const allowedTargetRoles = callerRoles.includes('SUPERVISOR') ? ['SAKHI'] : [];
      if (!allowedTargetRoles.includes(input.roleCode)) {
        throw forbidden(`You are not allowed to create a user with role ${input.roleCode}.`);
      }
    }

    const role = await this.repository.findRoleByCode(input.roleCode);
    if (!role || !role.isActive) throw notFound(`Unknown role code: ${input.roleCode}`);

    // A SAKHI has no usable identity without a sakhi_profiles row — every
    // endpoint that resolves "this Sakhi" (e.g. GET /sakhi/:id/dashboard)
    // queries that table, not users/user_roles. Created atomically below
    // rather than requiring a separate PATCH afterward, which previously
    // left a newly-created SAKHI 404ing until someone remembered to patch
    // in a phoneNumber. projectId is required here (not merely optional, as
    // it is for other roles) because sakhi_profiles.primary_project_id is
    // NOT NULL.
    if (input.roleCode === 'SAKHI' && !input.projectId) {
      throw badRequest('projectId: Required to create a SAKHI user.');
    }

    const passwordHash = await hashPassword(input.password);

    try {
      const user = await this.repository.createUserWithRole({
        username: input.username,
        mobileNumber: input.mobileNumber,
        passwordHash,
        displayName: input.displayName,
        email: input.email ?? null,
        roleId: role.id,
        projectId: input.projectId ?? null,
        geographyUnitId: input.geographyUnitId ?? null,
        sakhiProfile:
          input.roleCode === 'SAKHI'
            ? { primaryProjectId: input.projectId as string, phoneNumber: input.mobileNumber }
            : undefined,
      });
      return {
        id: user.id,
        username: user.username,
        mobileNumber: user.mobileNumber,
        displayName: user.displayName,
        email: user.email,
        status: user.status,
        createdAt: user.createdAt,
      };
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw conflict('A user with this username, mobile number, or email already exists.');
      }
      throw err;
    }
  }

  /**
   * Updates a user across `users`, the caller's currently-active `user_roles`
   * row (project/geography scope only), and `sakhi_profiles` in one request —
   * per product decision, one endpoint rather than four. All three writes
   * happen in a single transaction (see `AuthRepository.updateUserTransaction`):
   * either everything requested lands, or nothing does.
   *
   * `roleCode`/`employeeCode` existence and target-row lookups happen here
   * (not in the transaction) so a 404 can be thrown before any write starts.
   */
  async updateUser(id: string, input: UpdateUserInput): Promise<UserProfile> {
    const existing = await this.repository.findUserById(id);
    if (!existing || existing.isDeleted) throw notFound('User not found.');

    let userRoleId: string | undefined;
    if (input.roleCode) {
      const activeRole = await this.repository.findActiveUserRole(id, input.roleCode);
      if (!activeRole) {
        throw notFound(`User has no active ${input.roleCode} role assignment.`);
      }
      if (input.projectId) {
        const project = await this.repository.findProjectById(input.projectId);
        if (!project) throw notFound('Project not found.');
      }
      userRoleId = activeRole.id;
    }

    let sakhiProfileId: string | undefined;
    let sakhiProfileCreate:
      | { userId: string; primaryProjectId: string; phoneNumber: string; activeFrom: Date }
      | undefined;
    const sakhiProfileFields: Record<string, unknown> = {};
    if (input.employeeCode !== undefined) sakhiProfileFields.employeeCode = input.employeeCode;
    if (input.supervisorId !== undefined) sakhiProfileFields.supervisorId = input.supervisorId;
    if (input.phoneNumber !== undefined) sakhiProfileFields.phoneNumber = input.phoneNumber;
    if (input.backupContact !== undefined) sakhiProfileFields.backupContact = input.backupContact;
    if (input.ifscCode !== undefined) sakhiProfileFields.ifscCode = input.ifscCode;
    if (input.activeFrom !== undefined) sakhiProfileFields.activeFrom = new Date(input.activeFrom);
    if (input.activeTo !== undefined) {
      sakhiProfileFields.activeTo = input.activeTo ? new Date(input.activeTo) : null;
    }
    if (input.panNumber !== undefined) sakhiProfileFields.panToken = encryptPii(input.panNumber);
    if (input.aadhaarNumber !== undefined) {
      sakhiProfileFields.aadhaarToken = encryptPii(input.aadhaarNumber);
    }
    if (input.bankAccountNumber !== undefined) {
      sakhiProfileFields.bankAccountToken = encryptPii(input.bankAccountNumber);
    }
    if (Object.keys(sakhiProfileFields).length > 0) {
      const profile = await this.repository.findSakhiProfileByUserId(id);
      if (profile) {
        sakhiProfileId = profile.id;
      } else {
        // No profile yet — auto-create one (see the PATCH /users/:id design
        // note above). Requires the caller to supply enough to satisfy
        // sakhi_profiles' NOT NULL columns not already covered by
        // sakhiProfileFields: phoneNumber (validated above) and
        // primaryProjectId (derived from the user's active SAKHI role).
        const sakhiRole = await this.repository.findActiveUserRole(id, 'SAKHI');
        if (!sakhiRole) {
          throw badRequest(
            'User does not hold an active SAKHI role; cannot create a Sakhi profile.',
          );
        }
        // This read reflects the DB *before* the transaction below applies
        // input.projectId — a caller assigning a project and a Sakhi profile
        // in the same PATCH (roleCode: 'SAKHI', projectId, supervisorId/etc.)
        // must not be told "no project assigned" just because the write
        // hasn't happened yet. Only trust input.projectId here when this
        // same request's roleCode update targets the SAKHI role itself.
        const effectiveProjectId =
          input.roleCode === 'SAKHI' && input.projectId !== undefined
            ? input.projectId
            : sakhiRole.projectId;
        if (!effectiveProjectId) {
          throw badRequest(
            "User's SAKHI role has no project assigned; cannot create a Sakhi profile.",
          );
        }
        if (input.phoneNumber === undefined) {
          throw badRequest('phoneNumber: Required to create a Sakhi profile.');
        }
        sakhiProfileCreate = {
          userId: id,
          primaryProjectId: effectiveProjectId,
          phoneNumber: input.phoneNumber,
          activeFrom: input.activeFrom ? new Date(input.activeFrom) : new Date(),
        };
      }
    }

    const userFields: Record<string, unknown> = {};
    if (input.username !== undefined) userFields.username = input.username;
    if (input.displayName !== undefined) userFields.displayName = input.displayName;
    if (input.mobileNumber !== undefined) userFields.mobileNumber = input.mobileNumber;
    if (input.email !== undefined) userFields.email = input.email;
    if (input.status !== undefined) userFields.status = input.status;
    if (input.password !== undefined) {
      userFields.passwordHash = await hashPassword(input.password);
      userFields.passwordChangedAt = new Date();
    }

    try {
      const user = await this.repository.updateUserTransaction(id, {
        user: userFields,
        userRole: userRoleId
          ? {
              id: userRoleId,
              data: {
                ...(input.projectId !== undefined && { projectId: input.projectId }),
                ...(input.geographyUnitId !== undefined && {
                  geographyUnitId: input.geographyUnitId,
                }),
              },
            }
          : undefined,
        sakhiProfile: sakhiProfileId
          ? { id: sakhiProfileId, data: sakhiProfileFields }
          : sakhiProfileCreate
            ? { create: sakhiProfileCreate, data: sakhiProfileFields }
            : undefined,
        revokeSessions: input.username !== undefined || input.password !== undefined,
      });
      if (!user) throw notFound('User not found.');

      return toUserProfile(user);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw conflict(
          'A user with this username, mobile number, email, or employee code already exists.',
        );
      }
      throw err;
    }
  }

  /**
   * Reactivates a deactivated Sakhi's account after an approved DATA_RESTORE
   * Quick Response card. Deliberately a narrow, single-purpose operation —
   * unlike the general `PATCH /users/:id` (ADMIN-only, can change anything
   * about a user), this only ever flips status back to ACTIVE, so it can
   * safely be opened to SUPERVISOR/MANAGER without widening what they can
   * otherwise do to a user record.
   *
   * Restricted to SAKHI targets only — the route's role check
   * (SUPERVISOR/MANAGER/ADMIN can call it) says nothing about who can be
   * reactivated, so without this a SUPERVISOR could otherwise flip any
   * deactivated account back to ACTIVE, including another SUPERVISOR's or
   * an ADMIN's. A SUPERVISOR caller is further scoped to their own Sakhi
   * roster (sakhiProfile.supervisorId), the same ownership check
   * SakhiService.listByProject applies to reads.
   */
  async reactivateUser(userId: string, caller: CallerScope): Promise<UserProfile> {
    const existing = await this.repository.findUserByIdWithProfile(userId);
    if (!existing || existing.isDeleted) throw notFound('User not found.');

    const targetRoleCodes = existing.userRoles.map((ur) => ur.role.roleCode);
    if (!targetRoleCodes.includes('SAKHI')) {
      throw forbidden('Only Sakhi accounts can be reactivated via this endpoint.');
    }
    if (
      caller.roles.includes('SUPERVISOR') &&
      !caller.roles.includes('MANAGER') &&
      !caller.roles.includes('ADMIN') &&
      existing.sakhiProfile?.supervisorId !== caller.id
    ) {
      throw forbidden('This Sakhi is not in your roster.');
    }

    if (existing.status === 'ACTIVE') {
      throw conflict('This user is already ACTIVE.');
    }
    if (existing.status === 'DELETED') {
      throw conflict('A DELETED account cannot be reactivated this way.');
    }

    const reactivated = await this.repository.reactivateUser(userId);
    if (!reactivated) {
      // Raced with another status change between the read above and the
      // conditional update — same outcome as the checks above, just caught a
      // beat later instead of trusting a stale read.
      throw conflict('This user is no longer eligible for reactivation.');
    }

    const user = await this.repository.findUserByIdWithProfile(userId);
    if (!user) throw notFound('User not found.');
    return toUserProfile(user);
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const user = await this.repository.findUserByIdWithProfile(userId);
    if (!user || user.isDeleted) return null;
    return toUserProfile(user);
  }

  /**
   * Resolves a display name for any user id — a narrow, low-sensitivity
   * lookup (a name only, no PII/contact fields) other services call to
   * enrich a stored user id without a cross-service DB join (e.g.
   * media-service resolving `uploadedByUserId`).
   */
  async getDisplayName(id: string): Promise<{ id: string; displayName: string }> {
    const user = await this.repository.findDisplayNameById(id);
    if (!user || user.isDeleted) throw notFound('User not found.');
    return { id: user.id, displayName: user.displayName };
  }

  private async issueTokens(
    userId: string,
    userRoles: {
      role: { roleCode: string };
      projectId: string | null;
      geographyUnitId: string | null;
    }[],
    ipAddress: string | null,
    options?: { recordLogin?: boolean },
  ): Promise<AuthTokens> {
    // A user can hold multiple role assignments (e.g. scoped to different
    // projects); the token carries the full role-code set for requireRoles()
    // checks. Project/geography scope on the token reflects the first
    // assignment — routes needing finer multi-scope checks query user_roles
    // directly via /me.
    const roles = userRoles.map((ur) => ur.role.roleCode);
    const [primary] = userRoles;

    const isExpiringRole = roles.includes(EXPIRING_ROLE);
    const accessTokenPayload = {
      sub: userId,
      roles,
      projectId: primary?.projectId ?? null,
      geographyUnitId: primary?.geographyUnitId ?? null,
    };
    const accessToken = isExpiringRole
      ? await this.signer.sign(accessTokenPayload, this.adminAccessTokenTtl)
      : await this.signer.sign(accessTokenPayload);

    const refreshToken = generateRefreshToken();
    const now = new Date();
    const sessionData = {
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      issuedAt: now,
      ipAddress,
    };

    if (options?.recordLogin) {
      await this.repository.recordSuccessfulLoginAndCreateSession(userId, sessionData);
    } else {
      await this.repository.createSession(sessionData);
    }

    return {
      accessToken,
      refreshToken,
      expiresIn: isExpiringRole
        ? Math.floor(parseDurationMs(this.adminAccessTokenTtl) / 1000)
        : null,
      roles,
      projectId: primary?.projectId ?? null,
      geographyUnitId: primary?.geographyUnitId ?? null,
    };
  }
}

/** Narrows a caught Prisma error to a unique-constraint violation (P2002). */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === PRISMA_UNIQUE_CONSTRAINT_CODE
  );
}

export { hashPassword };
