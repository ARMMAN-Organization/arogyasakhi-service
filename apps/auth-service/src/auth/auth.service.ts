import type { TokenSigner } from '@armman/service-commons';
import { conflict, decryptPii, forbidden, notFound, unauthorized } from '@armman/service-commons';
import type { AuthRepository } from './auth.repository';
import { hashPassword, verifyPassword } from './password';
import { generateRefreshToken, hashRefreshToken } from './refresh-token';
import { parseDurationMs } from './duration';
import type { LoginInput } from './dto/login.dto';
import type { CreateUserInput } from './dto/create-user.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds, from now. */
  expiresIn: number;
  /** Every role code the caller holds — same set encoded in the access token's `roles` claim. */
  roles: string[];
  /** The primary role assignment's project/geography scope (first assignment; see issueTokens). */
  projectId: string | null;
  geographyUnitId: string | null;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string;
  mobileNumber: string;
  email: string | null;
  status: string;
  createdAt: Date;
  roles: { roleCode: string; projectId: string | null; geographyUnitId: string | null }[];
  /** The primary role's project name, or null if that role has no project (e.g. ADMIN). */
  projectName: string | null;
  /** Sakhi profile's employee_code — only present for SAKHI-role users. */
  cardNumber: string | null;
  /** Last 4 digits of the Sakhi's bank account, masked (e.g. "••••1234") — never the full number. */
  maskedBankAccount: string | null;
  /** Sakhi profile's supervisor_id — per SRS's Sakhi identity field list; only present for SAKHI-role users. */
  supervisorId: string | null;
}

const BANK_ACCOUNT_VISIBLE_DIGITS = 4;
const BANK_ACCOUNT_MASK = '••••';

/** Masks a decrypted bank account number down to its last 4 digits. */
function maskBankAccount(accountNumber: string): string {
  const lastDigits = accountNumber.slice(-BANK_ACCOUNT_VISIBLE_DIGITS);
  return `${BANK_ACCOUNT_MASK}${lastDigits}`;
}

export interface CreatedUser {
  id: string;
  username: string;
  mobileNumber: string;
  displayName: string;
  email: string | null;
  status: string;
  createdAt: Date;
}

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

  async getProfile(userId: string): Promise<UserProfile | null> {
    const user = await this.repository.findUserByIdWithProfile(userId);
    if (!user || user.isDeleted) return null;

    const [primaryRole] = user.userRoles;
    const profile = user.sakhiProfile && !user.sakhiProfile.isDeleted ? user.sakhiProfile : null;

    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      mobileNumber: user.mobileNumber,
      email: user.email,
      status: user.status,
      createdAt: user.createdAt,
      roles: user.userRoles.map((ur) => ({
        roleCode: ur.role.roleCode,
        projectId: ur.projectId,
        geographyUnitId: ur.geographyUnitId,
      })),
      projectName: primaryRole?.project?.projectName ?? null,
      cardNumber: profile?.employeeCode ?? null,
      maskedBankAccount: profile?.bankAccountToken
        ? maskBankAccount(decryptPii(profile.bankAccountToken))
        : null,
      supervisorId: profile?.supervisorId ?? null,
    };
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
