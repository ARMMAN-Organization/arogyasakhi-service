import type { TokenSigner } from '@armman/service-commons';
import { conflict, notFound, forbidden, unauthorized, encryptPii } from '@armman/service-commons';
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

/** Prisma unique-constraint violation code (mobileNumber/email/roleCode etc). */
const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

export class AuthService {
  constructor(
    private readonly repository: AuthRepository,
    private readonly signer: TokenSigner,
    private readonly accessTokenTtl: string,
    private readonly refreshTokenTtl: string,
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

    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      throw unauthorized('Invalid or expired refresh token.');
    }

    const user = await this.repository.findUserById(session.userId);
    if (!user || user.isDeleted || user.status !== 'ACTIVE') {
      throw unauthorized('Invalid or expired refresh token.');
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
      if (!profile) throw notFound('User has no Sakhi profile.');
      sakhiProfileId = profile.id;
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
        sakhiProfile: sakhiProfileId ? { id: sakhiProfileId, data: sakhiProfileFields } : undefined,
      });
      if (!user) throw notFound('User not found.');

      if (input.username !== undefined || input.password !== undefined) {
        await this.repository.revokeAllSessionsForUser(id);
      }

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

  async getProfile(userId: string): Promise<UserProfile | null> {
    const user = await this.repository.findUserByIdWithProfile(userId);
    if (!user || user.isDeleted) return null;
    return toUserProfile(user);
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

    const accessToken = await this.signer.sign(
      {
        sub: userId,
        roles,
        projectId: primary?.projectId ?? null,
        geographyUnitId: primary?.geographyUnitId ?? null,
      },
      this.accessTokenTtl,
    );

    const refreshToken = generateRefreshToken();
    const now = new Date();
    const sessionData = {
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + parseDurationMs(this.refreshTokenTtl)),
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
      expiresIn: Math.floor(parseDurationMs(this.accessTokenTtl) / 1000),
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
