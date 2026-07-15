import type { TokenSigner } from '@armman/service-commons';
import { conflict, notFound, unauthorized } from '@armman/service-commons';
import type { AuthRepository } from './auth.repository';
import { hashPassword, verifyPassword } from './password';
import { generateRefreshToken, hashRefreshToken } from './refresh-token';
import { parseDurationMs } from './duration';
import type { LoginInput } from './dto/login.dto';
import type { CreateUserInput } from './dto/create-user.dto';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface UserProfile {
  id: string;
  username: string | null;
  displayName: string;
  mobileNumber: string;
  roles: { roleCode: string; projectId: string | null; geographyUnitId: string | null }[];
}

export interface CreatedUser {
  id: string;
  username: string | null;
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
    const user = await this.repository.findUserByIdentifier(input.username);

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

    await this.repository.recordSuccessfulLogin(user.id);
    return this.issueTokens(user.id, user.userRoles, ipAddress);
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
   */
  async createUser(input: CreateUserInput): Promise<CreatedUser> {
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
    const user = await this.repository.findUserById(userId);
    if (!user || user.isDeleted) return null;
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      mobileNumber: user.mobileNumber,
      roles: user.userRoles.map((ur) => ({
        roleCode: ur.role.roleCode,
        projectId: ur.projectId,
        geographyUnitId: ur.geographyUnitId,
      })),
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
    await this.repository.createSession({
      userId,
      refreshTokenHash: hashRefreshToken(refreshToken),
      issuedAt: now,
      expiresAt: new Date(now.getTime() + parseDurationMs(this.refreshTokenTtl)),
      ipAddress,
    });

    return { accessToken, refreshToken };
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
