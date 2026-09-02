import { randomBytes } from 'node:crypto';
import { AuthService } from './auth.service';
import type { AuthRepository } from './auth.repository';
import { encryptPii, type TokenSigner } from '@armman/service-commons';

jest.mock('./password', () => ({
  verifyPassword: jest.fn(),
  hashPassword: jest.fn((plain: string) => Promise.resolve(`hashed(${plain})`)),
}));
jest.mock('./refresh-token', () => ({
  generateRefreshToken: jest.fn(() => 'plain-refresh-token'),
  hashRefreshToken: jest.fn((token: string) => `hashed(${token})`),
}));

import { verifyPassword } from './password';

const ACTIVE_USER = {
  id: 'user-1',
  username: 'test.sakhi',
  mobileNumber: '+919876543210',
  passwordHash: 'hashed-password',
  displayName: 'Test Sakhi',
  email: 'test.sakhi@example.org',
  status: 'ACTIVE' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  isDeleted: false,
  userRoles: [
    {
      projectId: 'project-1',
      geographyUnitId: 'geo-1',
      role: { roleCode: 'SAKHI' },
    },
  ],
};

/** Row shape returned by `updateUserTransaction` — same shape `toUserProfile` maps. */
function updatedUserRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    username: 'test.sakhi',
    displayName: 'Test Sakhi',
    mobileNumber: '+919876543210',
    email: 'test.sakhi@example.org',
    status: 'ACTIVE' as const,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userRoles: [
      {
        projectId: 'project-1',
        geographyUnitId: 'geo-1',
        role: { roleCode: 'SAKHI' },
        project: { projectName: 'GEP-2324' },
      },
    ],
    sakhiProfile: null,
    ...overrides,
  };
}

describe('AuthService', () => {
  const repository = {
    findUserByUsername: jest.fn(),
    findUserById: jest.fn(),
    findUserByIdWithProfile: jest.fn(),
    incrementFailedLoginCount: jest.fn(),
    recordSuccessfulLogin: jest.fn(),
    recordSuccessfulLoginAndCreateSession: jest.fn(),
    createSession: jest.fn(),
    findActiveSessionByRefreshTokenHash: jest.fn(),
    revokeSession: jest.fn(),
    revokeSessionByRefreshTokenHash: jest.fn(),
    findRoleByCode: jest.fn(),
    createUserWithRole: jest.fn(),
    findProjectById: jest.fn(),
    findActiveUserRole: jest.fn(),
    findSakhiProfileByUserId: jest.fn(),
    updateUserTransaction: jest.fn(),
    reactivateUser: jest.fn(),
    findDisplayNameById: jest.fn(),
    findServiceAccountByClientId: jest.fn(),
    incrementServiceAccountFailedAuthCount: jest.fn(),
    recordSuccessfulServiceAuth: jest.fn(),
  } as unknown as jest.Mocked<AuthRepository>;

  const signer = {
    sign: jest.fn(),
    verify: jest.fn(),
  } as unknown as jest.Mocked<TokenSigner>;

  let service: AuthService;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    signer.sign.mockResolvedValue('signed-access-token');
    service = new AuthService(repository, signer, '15m');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  describe('login', () => {
    it('issues tokens on correct username and password', async () => {
      repository.findUserByUsername.mockResolvedValue(ACTIVE_USER as never);
      (verifyPassword as jest.Mock).mockResolvedValue(true);

      const tokens = await service.login(
        { username: 'test.sakhi', password: 'correct' },
        '127.0.0.1',
      );

      expect(tokens).toEqual({
        accessToken: 'signed-access-token',
        refreshToken: 'plain-refresh-token',
        expiresIn: null,
        roles: ['SAKHI'],
        projectId: 'project-1',
        geographyUnitId: 'geo-1',
      });
      expect(repository.recordSuccessfulLoginAndCreateSession).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({
          userId: 'user-1',
          refreshTokenHash: 'hashed(plain-refresh-token)',
        }),
      );
      expect(repository.createSession).not.toHaveBeenCalled();
      // No second (expiresIn) argument: the access token carries no exp
      // claim and never expires by time.
      expect(signer.sign).toHaveBeenCalledWith({
        sub: 'user-1',
        roles: ['SAKHI'],
        projectId: 'project-1',
        geographyUnitId: 'geo-1',
      });
    });

    it('issues an expiring access token for an ADMIN login', async () => {
      const adminUser = {
        ...ACTIVE_USER,
        userRoles: [{ projectId: null, geographyUnitId: null, role: { roleCode: 'ADMIN' } }],
      };
      repository.findUserByUsername.mockResolvedValue(adminUser as never);
      (verifyPassword as jest.Mock).mockResolvedValue(true);

      const tokens = await service.login(
        { username: 'test.sakhi', password: 'correct' },
        '127.0.0.1',
      );

      expect(tokens).toEqual({
        accessToken: 'signed-access-token',
        refreshToken: 'plain-refresh-token',
        expiresIn: 900,
        roles: ['ADMIN'],
        projectId: null,
        geographyUnitId: null,
      });
      expect(signer.sign).toHaveBeenCalledWith(
        { sub: 'user-1', roles: ['ADMIN'], projectId: null, geographyUnitId: null },
        '15m',
      );
    });

    it('still expires the access token when ADMIN is only one of several roles held', async () => {
      const multiRoleUser = {
        ...ACTIVE_USER,
        userRoles: [
          { projectId: 'project-1', geographyUnitId: 'geo-1', role: { roleCode: 'SUPERVISOR' } },
          { projectId: null, geographyUnitId: null, role: { roleCode: 'ADMIN' } },
        ],
      };
      repository.findUserByUsername.mockResolvedValue(multiRoleUser as never);
      (verifyPassword as jest.Mock).mockResolvedValue(true);

      const tokens = await service.login(
        { username: 'test.sakhi', password: 'correct' },
        '127.0.0.1',
      );

      expect(tokens.expiresIn).toBe(900);
      expect(signer.sign).toHaveBeenCalledWith(expect.anything(), '15m');
    });

    it('rejects with a generic error for a non-existent username', async () => {
      repository.findUserByUsername.mockResolvedValue(null);
      await expect(
        service.login({ username: 'nobody', password: 'anything' }, null),
      ).rejects.toMatchObject({ status: 401, message: 'Invalid credentials.' });
      expect(repository.incrementFailedLoginCount).not.toHaveBeenCalled();
    });

    it('increments failedLoginCount and rejects on wrong password', async () => {
      repository.findUserByUsername.mockResolvedValue(ACTIVE_USER as never);
      (verifyPassword as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ username: 'test.sakhi', password: 'wrong' }, null),
      ).rejects.toMatchObject({ status: 401 });
      expect(repository.incrementFailedLoginCount).toHaveBeenCalledWith('user-1');
      expect(repository.recordSuccessfulLoginAndCreateSession).not.toHaveBeenCalled();
    });

    it('rejects a LOCKED user regardless of password correctness', async () => {
      repository.findUserByUsername.mockResolvedValue({
        ...ACTIVE_USER,
        status: 'LOCKED',
      } as never);

      await expect(
        service.login({ username: 'test.sakhi', password: 'correct' }, null),
      ).rejects.toMatchObject({ status: 401 });
      expect(verifyPassword).not.toHaveBeenCalled();
      expect(repository.incrementFailedLoginCount).toHaveBeenCalledWith('user-1');
    });

    it('rejects a soft-deleted user', async () => {
      repository.findUserByUsername.mockResolvedValue({ ...ACTIVE_USER, isDeleted: true } as never);

      await expect(
        service.login({ username: 'test.sakhi', password: 'correct' }, null),
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('refresh', () => {
    // expiresAt is null: sessions no longer expire by time (see
    // AuthService.issueTokens) — only revokedAt gates rejection now.
    const ACTIVE_SESSION = {
      id: 'session-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: null,
    };

    it('rotates the refresh token and issues a new pair on a valid token', async () => {
      repository.findActiveSessionByRefreshTokenHash.mockResolvedValue(ACTIVE_SESSION as never);
      repository.findUserById.mockResolvedValue(ACTIVE_USER as never);

      const tokens = await service.refresh('presented-refresh-token', '127.0.0.1');

      expect(repository.revokeSession).toHaveBeenCalledWith('session-1');
      expect(tokens).toEqual({
        accessToken: 'signed-access-token',
        refreshToken: 'plain-refresh-token',
        expiresIn: null,
        roles: ['SAKHI'],
        projectId: 'project-1',
        geographyUnitId: 'geo-1',
      });
    });

    it('still refreshes a session created before the never-expires change (real expiresAt, not revoked)', async () => {
      // A pre-existing row can still carry a real expiresAt timestamp from
      // before this schema change — including one that would have been "in
      // the past" under the old TTL check. It must no longer matter: only
      // revokedAt gates rejection now.
      repository.findActiveSessionByRefreshTokenHash.mockResolvedValue({
        ...ACTIVE_SESSION,
        expiresAt: new Date(Date.now() - 1000),
      } as never);
      repository.findUserById.mockResolvedValue(ACTIVE_USER as never);

      const tokens = await service.refresh('presented-refresh-token', '127.0.0.1');

      expect(repository.revokeSession).toHaveBeenCalledWith('session-1');
      expect(tokens.expiresIn).toBeNull();
    });

    it('rejects an already-revoked refresh token', async () => {
      repository.findActiveSessionByRefreshTokenHash.mockResolvedValue({
        ...ACTIVE_SESSION,
        revokedAt: new Date(),
      } as never);

      await expect(service.refresh('revoked-token', null)).rejects.toMatchObject({ status: 401 });
    });

    it('rejects an unknown refresh token', async () => {
      repository.findActiveSessionByRefreshTokenHash.mockResolvedValue(null);

      await expect(service.refresh('garbage-token', null)).rejects.toMatchObject({ status: 401 });
    });

    it('rejects a refresh token belonging to a now-locked user', async () => {
      repository.findActiveSessionByRefreshTokenHash.mockResolvedValue(ACTIVE_SESSION as never);
      repository.findUserById.mockResolvedValue({ ...ACTIVE_USER, status: 'LOCKED' } as never);

      await expect(service.refresh('presented-refresh-token', null)).rejects.toMatchObject({
        status: 401,
      });
      expect(repository.revokeSession).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes the session for the presented refresh token', async () => {
      await service.logout('some-refresh-token');
      expect(repository.revokeSessionByRefreshTokenHash).toHaveBeenCalledWith(
        'hashed(some-refresh-token)',
      );
    });

    it('is idempotent when the token is already revoked or unknown', async () => {
      repository.revokeSessionByRefreshTokenHash.mockResolvedValue({ count: 0 } as never);
      await expect(service.logout('already-logged-out-token')).resolves.toBeUndefined();
    });
  });

  describe('createUser', () => {
    const ACTIVE_ROLE = { id: 'role-1', roleCode: 'SAKHI', isActive: true };
    const CREATED_USER = {
      id: 'user-2',
      username: 'new.sakhi',
      mobileNumber: '+919876543211',
      displayName: 'New Sakhi',
      email: null,
      status: 'ACTIVE' as const,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    it('hashes the password, creates the user, role assignment, and sakhi_profiles row', async () => {
      repository.findRoleByCode.mockResolvedValue(ACTIVE_ROLE as never);
      repository.createUserWithRole.mockResolvedValue(CREATED_USER as never);

      const result = await service.createUser(
        {
          username: 'new.sakhi',
          mobileNumber: '+919876543211',
          password: 'Str0ngPass!',
          displayName: 'New Sakhi',
          roleCode: 'SAKHI',
          projectId: 'project-1',
        },
        ['ADMIN'],
      );

      expect(repository.findRoleByCode).toHaveBeenCalledWith('SAKHI');
      expect(repository.createUserWithRole).toHaveBeenCalledWith({
        username: 'new.sakhi',
        mobileNumber: '+919876543211',
        passwordHash: 'hashed(Str0ngPass!)',
        displayName: 'New Sakhi',
        email: null,
        roleId: 'role-1',
        projectId: 'project-1',
        geographyUnitId: null,
        sakhiProfile: { primaryProjectId: 'project-1', phoneNumber: '+919876543211' },
      });
      expect(result).toEqual({
        id: 'user-2',
        username: 'new.sakhi',
        mobileNumber: '+919876543211',
        displayName: 'New Sakhi',
        email: null,
        status: 'ACTIVE',
        createdAt: CREATED_USER.createdAt,
      });
    });

    it('rejects creating a SAKHI without projectId — sakhi_profiles.primary_project_id is NOT NULL', async () => {
      repository.findRoleByCode.mockResolvedValue(ACTIVE_ROLE as never);

      await expect(
        service.createUser(
          {
            username: 'new.sakhi',
            mobileNumber: '+919876543211',
            password: 'Str0ngPass!',
            displayName: 'New Sakhi',
            roleCode: 'SAKHI',
          },
          ['ADMIN'],
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.createUserWithRole).not.toHaveBeenCalled();
    });

    it('does not require projectId or create a sakhi_profiles row for a non-SAKHI role', async () => {
      repository.findRoleByCode.mockResolvedValue({
        id: 'role-2',
        roleCode: 'SUPERVISOR',
        isActive: true,
      } as never);
      repository.createUserWithRole.mockResolvedValue({
        ...CREATED_USER,
        username: 'new.supervisor',
      } as never);

      await service.createUser(
        {
          username: 'new.supervisor',
          mobileNumber: '+919876543215',
          password: 'Str0ngPass!',
          displayName: 'New Supervisor',
          roleCode: 'SUPERVISOR',
        },
        ['ADMIN'],
      );

      expect(repository.createUserWithRole).toHaveBeenCalledWith(
        expect.objectContaining({ sakhiProfile: undefined }),
      );
    });

    it('rejects an unknown role code without creating a user', async () => {
      repository.findRoleByCode.mockResolvedValue(null);

      await expect(
        service.createUser(
          {
            username: 'new.sakhi',
            mobileNumber: '+919876543211',
            password: 'Str0ngPass!',
            displayName: 'New Sakhi',
            roleCode: 'NOT_A_ROLE',
          },
          ['ADMIN'],
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.createUserWithRole).not.toHaveBeenCalled();
    });

    it('rejects an inactive role code', async () => {
      repository.findRoleByCode.mockResolvedValue({ ...ACTIVE_ROLE, isActive: false } as never);

      await expect(
        service.createUser(
          {
            username: 'new.sakhi',
            mobileNumber: '+919876543211',
            password: 'Str0ngPass!',
            displayName: 'New Sakhi',
            roleCode: 'SAKHI',
          },
          ['ADMIN'],
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('maps a duplicate username, mobile number, or email to a 409 conflict', async () => {
      repository.findRoleByCode.mockResolvedValue(ACTIVE_ROLE as never);
      repository.createUserWithRole.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.createUser(
          {
            username: 'new.sakhi',
            mobileNumber: '+919876543211',
            password: 'Str0ngPass!',
            displayName: 'New Sakhi',
            roleCode: 'SAKHI',
            projectId: 'project-1',
          },
          ['ADMIN'],
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('propagates unrelated repository errors unchanged', async () => {
      repository.findRoleByCode.mockResolvedValue(ACTIVE_ROLE as never);
      repository.createUserWithRole.mockRejectedValue(new Error('db down'));

      await expect(
        service.createUser(
          {
            username: 'new.sakhi',
            mobileNumber: '+919876543211',
            password: 'Str0ngPass!',
            displayName: 'New Sakhi',
            roleCode: 'SAKHI',
            projectId: 'project-1',
          },
          ['ADMIN'],
        ),
      ).rejects.toThrow('db down');
    });

    it('allows a SUPERVISOR to create a SAKHI', async () => {
      repository.findRoleByCode.mockResolvedValue(ACTIVE_ROLE as never);
      repository.createUserWithRole.mockResolvedValue(CREATED_USER as never);

      await expect(
        service.createUser(
          {
            username: 'new.sakhi',
            mobileNumber: '+919876543211',
            password: 'Str0ngPass!',
            displayName: 'New Sakhi',
            roleCode: 'SAKHI',
            projectId: 'project-1',
          },
          ['SUPERVISOR'],
        ),
      ).resolves.toBeDefined();
      expect(repository.createUserWithRole).toHaveBeenCalled();
    });

    it('rejects a SUPERVISOR trying to create a SUPERVISOR', async () => {
      await expect(
        service.createUser(
          {
            username: 'new.supervisor',
            mobileNumber: '+919876543212',
            password: 'Str0ngPass!',
            displayName: 'New Supervisor',
            roleCode: 'SUPERVISOR',
          },
          ['SUPERVISOR'],
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findRoleByCode).not.toHaveBeenCalled();
      expect(repository.createUserWithRole).not.toHaveBeenCalled();
    });

    it('rejects a SUPERVISOR trying to create an ADMIN', async () => {
      await expect(
        service.createUser(
          {
            username: 'new.admin',
            mobileNumber: '+919876543213',
            password: 'Str0ngPass!',
            displayName: 'New Admin',
            roleCode: 'ADMIN',
          },
          ['SUPERVISOR'],
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('rejects a caller with neither ADMIN nor SUPERVISOR', async () => {
      await expect(
        service.createUser(
          {
            username: 'new.sakhi',
            mobileNumber: '+919876543214',
            password: 'Str0ngPass!',
            displayName: 'New Sakhi',
            roleCode: 'SAKHI',
          },
          ['SAKHI'],
        ),
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  describe('getProfile', () => {
    // A function, not a constant: bankAccountToken must be encrypted AFTER
    // beforeEach sets PII_ENCRYPTION_KEY, not at describe-block evaluation
    // time (which runs once, before any beforeEach, against a stale/unset key).
    const activeUserWithProfile = () => ({
      ...ACTIVE_USER,
      userRoles: [
        {
          projectId: 'project-1',
          geographyUnitId: 'geo-1',
          role: { roleCode: 'SAKHI' },
          project: { projectName: 'GEP-2324' },
        },
      ],
      sakhiProfile: {
        employeeCode: 'EMP-00123',
        bankAccountToken: encryptPii('1234567890'),
        supervisorId: 'supervisor-1',
      },
    });

    it('returns the profile with role/project/geography scope', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue({
        ...activeUserWithProfile(),
        sakhiProfile: null,
      } as never);

      await expect(service.getProfile('user-1')).resolves.toEqual({
        id: 'user-1',
        username: 'test.sakhi',
        displayName: 'Test Sakhi',
        mobileNumber: '+919876543210',
        email: 'test.sakhi@example.org',
        status: 'ACTIVE',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        roles: [{ roleCode: 'SAKHI', projectId: 'project-1', geographyUnitId: 'geo-1' }],
        projectName: 'GEP-2324',
        cardNumber: null,
        maskedBankAccount: null,
        supervisorId: null,
      });
    });

    it('includes cardNumber and a masked (never full) bank account for a SAKHI with a profile', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue(activeUserWithProfile() as never);

      const profile = await service.getProfile('user-1');

      expect(profile?.cardNumber).toBe('EMP-00123');
      expect(profile?.maskedBankAccount).toBe('••••7890');
      expect(profile?.maskedBankAccount).not.toContain('123456');
      expect(profile?.supervisorId).toBe('supervisor-1');
    });

    it('returns null projectName when the primary role has no project (e.g. ADMIN)', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue({
        ...ACTIVE_USER,
        userRoles: [
          { projectId: null, geographyUnitId: null, role: { roleCode: 'ADMIN' }, project: null },
        ],
        sakhiProfile: null,
      } as never);

      const profile = await service.getProfile('user-1');

      expect(profile?.projectName).toBeNull();
      expect(profile?.cardNumber).toBeNull();
      expect(profile?.maskedBankAccount).toBeNull();
    });

    it('treats a soft-deleted Sakhi profile as absent (no stale card/bank/supervisor fields)', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue({
        ...activeUserWithProfile(),
        sakhiProfile: { ...activeUserWithProfile().sakhiProfile, isDeleted: true },
      } as never);

      const profile = await service.getProfile('user-1');

      expect(profile?.cardNumber).toBeNull();
      expect(profile?.maskedBankAccount).toBeNull();
      expect(profile?.supervisorId).toBeNull();
    });

    it('returns null for a soft-deleted user', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue({
        ...activeUserWithProfile(),
        isDeleted: true,
      } as never);
      await expect(service.getProfile('user-1')).resolves.toBeNull();
    });

    it('returns null for a non-existent user', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue(null);
      await expect(service.getProfile('missing')).resolves.toBeNull();
    });
  });

  describe('getDisplayName', () => {
    it('returns the id and displayName for an active user', async () => {
      repository.findDisplayNameById.mockResolvedValue({
        id: 'user-1',
        displayName: 'Test Sakhi',
        isDeleted: false,
      } as never);

      await expect(service.getDisplayName('user-1')).resolves.toEqual({
        id: 'user-1',
        displayName: 'Test Sakhi',
      });
    });

    it('throws notFound (404) for a soft-deleted user', async () => {
      repository.findDisplayNameById.mockResolvedValue({
        id: 'user-1',
        displayName: 'Test Sakhi',
        isDeleted: true,
      } as never);

      await expect(service.getDisplayName('user-1')).rejects.toMatchObject({ status: 404 });
    });

    it('throws notFound (404) for a non-existent user', async () => {
      repository.findDisplayNameById.mockResolvedValue(null);

      await expect(service.getDisplayName('missing')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('updateUser', () => {
    beforeEach(() => {
      repository.findUserById.mockResolvedValue(ACTIVE_USER as never);
    });

    it('updates displayName only and returns the full profile', async () => {
      repository.updateUserTransaction.mockResolvedValue(
        updatedUserRow({ displayName: 'Renamed Sakhi' }) as never,
      );

      const result = await service.updateUser('user-1', { displayName: 'Renamed Sakhi' });

      expect(repository.updateUserTransaction).toHaveBeenCalledWith('user-1', {
        user: { displayName: 'Renamed Sakhi' },
        userRole: undefined,
        sakhiProfile: undefined,
        revokeSessions: false,
      });
      expect(result.displayName).toBe('Renamed Sakhi');
    });

    it('throws 404 when the user does not exist or is soft-deleted', async () => {
      repository.findUserById.mockResolvedValue(null);
      await expect(service.updateUser('missing', { displayName: 'X' })).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.updateUserTransaction).not.toHaveBeenCalled();
    });

    it('throws 404 for a soft-deleted user', async () => {
      repository.findUserById.mockResolvedValue({ ...ACTIVE_USER, isDeleted: true } as never);
      await expect(service.updateUser('user-1', { displayName: 'X' })).rejects.toMatchObject({
        status: 404,
      });
    });

    it('maps a duplicate username/mobile/email/employeeCode to a 409 conflict', async () => {
      repository.updateUserTransaction.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.updateUser('user-1', { mobileNumber: '+919876543210' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('propagates unrelated repository errors unchanged', async () => {
      repository.updateUserTransaction.mockRejectedValue(new Error('db down'));
      await expect(service.updateUser('user-1', { displayName: 'X' })).rejects.toThrow('db down');
    });

    describe('username', () => {
      it('updates username and revokes all active sessions in the same transaction', async () => {
        repository.updateUserTransaction.mockResolvedValue(
          updatedUserRow({ username: 'new.username' }) as never,
        );

        const result = await service.updateUser('user-1', { username: 'new.username' });

        expect(repository.updateUserTransaction).toHaveBeenCalledWith('user-1', {
          user: { username: 'new.username' },
          userRole: undefined,
          sakhiProfile: undefined,
          revokeSessions: true,
        });
        expect(result.username).toBe('new.username');
      });

      it('maps a duplicate username to a 409 conflict', async () => {
        repository.updateUserTransaction.mockRejectedValue({ code: 'P2002' });
        await expect(
          service.updateUser('user-1', { username: 'taken.username' }),
        ).rejects.toMatchObject({ status: 409 });
      });
    });

    describe('password', () => {
      it('hashes the new password, sets passwordChangedAt, and revokes all active sessions in the same transaction', async () => {
        repository.updateUserTransaction.mockResolvedValue(updatedUserRow() as never);

        await service.updateUser('user-1', { password: 'NewStr0ngPass!' });

        expect(repository.updateUserTransaction).toHaveBeenCalledWith('user-1', {
          user: {
            passwordHash: 'hashed(NewStr0ngPass!)',
            passwordChangedAt: expect.any(Date),
          },
          userRole: undefined,
          sakhiProfile: undefined,
          revokeSessions: true,
        });
      });

      it('never includes passwordHash or plaintext password in the returned profile', async () => {
        repository.updateUserTransaction.mockResolvedValue(updatedUserRow() as never);

        const result = await service.updateUser('user-1', { password: 'NewStr0ngPass!' });

        expect(result).not.toHaveProperty('passwordHash');
        expect(result).not.toHaveProperty('password');
      });
    });

    describe('role/project/geography scope', () => {
      it('updates projectId and geographyUnitId on the matching active role row', async () => {
        repository.findActiveUserRole.mockResolvedValue({ id: 'user-role-1' } as never);
        repository.findProjectById.mockResolvedValue({ projectId: 'project-2' } as never);
        repository.updateUserTransaction.mockResolvedValue(
          updatedUserRow({
            userRoles: [
              {
                projectId: 'project-2',
                geographyUnitId: 'geo-2',
                role: { roleCode: 'SAKHI' },
                project: { projectName: 'GEP-2425' },
              },
            ],
          }) as never,
        );

        await service.updateUser('user-1', {
          roleCode: 'SAKHI',
          projectId: 'project-2',
          geographyUnitId: 'geo-2',
        });

        expect(repository.findActiveUserRole).toHaveBeenCalledWith('user-1', 'SAKHI');
        expect(repository.findProjectById).toHaveBeenCalledWith('project-2');
        expect(repository.updateUserTransaction).toHaveBeenCalledWith('user-1', {
          user: {},
          userRole: {
            id: 'user-role-1',
            data: { projectId: 'project-2', geographyUnitId: 'geo-2' },
          },
          sakhiProfile: undefined,
          revokeSessions: false,
        });
      });

      it('throws 404 when the user has no active role matching roleCode', async () => {
        repository.findActiveUserRole.mockResolvedValue(null);

        await expect(
          service.updateUser('user-1', { roleCode: 'MANAGER', projectId: 'project-2' }),
        ).rejects.toMatchObject({ status: 404 });
        expect(repository.updateUserTransaction).not.toHaveBeenCalled();
      });

      it('throws 404 when projectId does not reference an existing project', async () => {
        repository.findActiveUserRole.mockResolvedValue({ id: 'user-role-1' } as never);
        repository.findProjectById.mockResolvedValue(null);

        await expect(
          service.updateUser('user-1', { roleCode: 'SAKHI', projectId: 'missing-project' }),
        ).rejects.toMatchObject({ status: 404 });
        expect(repository.updateUserTransaction).not.toHaveBeenCalled();
      });

      it('allows clearing projectId to null on the matching role row', async () => {
        repository.findActiveUserRole.mockResolvedValue({ id: 'user-role-1' } as never);
        repository.updateUserTransaction.mockResolvedValue(updatedUserRow() as never);

        await service.updateUser('user-1', { roleCode: 'SAKHI', projectId: null });

        expect(repository.findProjectById).not.toHaveBeenCalled();
        expect(repository.updateUserTransaction).toHaveBeenCalledWith('user-1', {
          user: {},
          userRole: { id: 'user-role-1', data: { projectId: null } },
          sakhiProfile: undefined,
          revokeSessions: false,
        });
      });
    });

    describe('Sakhi profile fields', () => {
      it('updates employeeCode (cardNumber) for a SAKHI user', async () => {
        repository.findSakhiProfileByUserId.mockResolvedValue({ id: 'sakhi-profile-1' } as never);
        repository.updateUserTransaction.mockResolvedValue(
          updatedUserRow({
            sakhiProfile: { employeeCode: 'EMP-00999', bankAccountToken: null, supervisorId: null },
          }) as never,
        );

        const result = await service.updateUser('user-1', { employeeCode: 'EMP-00999' });

        expect(repository.updateUserTransaction).toHaveBeenCalledWith('user-1', {
          user: {},
          userRole: undefined,
          sakhiProfile: { id: 'sakhi-profile-1', data: { employeeCode: 'EMP-00999' } },
          revokeSessions: false,
        });
        expect(result.cardNumber).toBe('EMP-00999');
      });

      it('throws 400 for a user with no active SAKHI role and no Sakhi profile', async () => {
        repository.findSakhiProfileByUserId.mockResolvedValue(null);
        repository.findActiveUserRole.mockResolvedValue(null);

        await expect(
          service.updateUser('user-1', { employeeCode: 'EMP-00999', phoneNumber: '+919000000001' }),
        ).rejects.toMatchObject({ status: 400 });
        expect(repository.updateUserTransaction).not.toHaveBeenCalled();
      });

      describe('auto-creating a missing profile for a SAKHI', () => {
        it('creates the profile using the SAKHI role project and revokes no sessions', async () => {
          repository.findSakhiProfileByUserId.mockResolvedValue(null);
          repository.findActiveUserRole.mockResolvedValue({
            id: 'user-role-1',
            projectId: 'project-1',
          } as never);
          repository.updateUserTransaction.mockResolvedValue(
            updatedUserRow({
              sakhiProfile: {
                employeeCode: 'EMP-01000',
                bankAccountToken: null,
                supervisorId: null,
              },
            }) as never,
          );

          await service.updateUser('user-1', {
            employeeCode: 'EMP-01000',
            phoneNumber: '+919876544139',
          });

          expect(repository.updateUserTransaction).toHaveBeenCalledWith('user-1', {
            user: {},
            userRole: undefined,
            sakhiProfile: {
              create: {
                userId: 'user-1',
                primaryProjectId: 'project-1',
                phoneNumber: '+919876544139',
                activeFrom: expect.any(Date),
              },
              data: { employeeCode: 'EMP-01000', phoneNumber: '+919876544139' },
            },
            revokeSessions: false,
          });
        });

        it('uses the provided activeFrom instead of now, when given', async () => {
          repository.findSakhiProfileByUserId.mockResolvedValue(null);
          repository.findActiveUserRole.mockResolvedValue({
            id: 'user-role-1',
            projectId: 'project-1',
          } as never);
          repository.updateUserTransaction.mockResolvedValue(updatedUserRow() as never);

          await service.updateUser('user-1', {
            phoneNumber: '+919876544139',
            activeFrom: '2026-07-27',
          });

          const call = repository.updateUserTransaction.mock.calls[0][1] as {
            sakhiProfile: { create: Record<string, unknown> };
          };
          expect(call.sakhiProfile.create.activeFrom).toEqual(new Date('2026-07-27'));
        });

        it('throws 400 when the user has no active SAKHI role', async () => {
          repository.findSakhiProfileByUserId.mockResolvedValue(null);
          repository.findActiveUserRole.mockResolvedValue(null);

          await expect(
            service.updateUser('user-1', { phoneNumber: '+919876544139' }),
          ).rejects.toMatchObject({ status: 400 });
          expect(repository.updateUserTransaction).not.toHaveBeenCalled();
        });

        it('throws 400 when the SAKHI role has no project assigned', async () => {
          repository.findSakhiProfileByUserId.mockResolvedValue(null);
          repository.findActiveUserRole.mockResolvedValue({
            id: 'user-role-1',
            projectId: null,
          } as never);

          await expect(
            service.updateUser('user-1', { phoneNumber: '+919876544139' }),
          ).rejects.toMatchObject({ status: 400 });
          expect(repository.updateUserTransaction).not.toHaveBeenCalled();
        });

        it('throws 400 when phoneNumber is not provided', async () => {
          repository.findSakhiProfileByUserId.mockResolvedValue(null);
          repository.findActiveUserRole.mockResolvedValue({
            id: 'user-role-1',
            projectId: 'project-1',
          } as never);

          await expect(
            service.updateUser('user-1', { employeeCode: 'EMP-01000' }),
          ).rejects.toMatchObject({ status: 400 });
          expect(repository.updateUserTransaction).not.toHaveBeenCalled();
        });

        it("creates the profile using this same request's projectId, when roleCode SAKHI and projectId are both set in one call", async () => {
          // Regression test: previously, assigning a SAKHI's projectId and
          // creating their Sakhi profile (supervisorId/phoneNumber) in the
          // same PATCH failed with "SAKHI role has no project assigned" —
          // the profile-creation check read findActiveUserRole's
          // *pre-update* row instead of this same request's input.projectId.
          repository.findSakhiProfileByUserId.mockResolvedValue(null);
          repository.findActiveUserRole.mockImplementation(((_userId: string, roleCode: string) =>
            Promise.resolve(
              roleCode === 'SAKHI' ? { id: 'user-role-1', projectId: null } : null,
            )) as never);
          repository.findProjectById.mockResolvedValue({ projectId: 'project-new' } as never);
          repository.updateUserTransaction.mockResolvedValue(updatedUserRow() as never);

          await service.updateUser('user-1', {
            roleCode: 'SAKHI',
            projectId: 'project-new',
            supervisorId: 'supervisor-1',
            phoneNumber: '+919876544139',
          });

          expect(repository.updateUserTransaction).toHaveBeenCalledWith(
            'user-1',
            expect.objectContaining({
              userRole: { id: 'user-role-1', data: { projectId: 'project-new' } },
              sakhiProfile: {
                create: {
                  userId: 'user-1',
                  primaryProjectId: 'project-new',
                  phoneNumber: '+919876544139',
                  activeFrom: expect.any(Date),
                },
                data: { supervisorId: 'supervisor-1', phoneNumber: '+919876544139' },
              },
            }),
          );
        });

        it('still throws 400 when projectId is set for a DIFFERENT roleCode than SAKHI', async () => {
          // input.projectId should only be trusted as the effective project
          // when this same request's roleCode update targets SAKHI itself —
          // a MANAGER role's projectId update must not leak into an
          // unrelated Sakhi-profile creation.
          repository.findSakhiProfileByUserId.mockResolvedValue(null);
          repository.findActiveUserRole.mockImplementation(((_userId: string, roleCode: string) =>
            Promise.resolve(
              roleCode === 'MANAGER'
                ? { id: 'manager-role-1', projectId: 'manager-project-1' }
                : roleCode === 'SAKHI'
                  ? { id: 'sakhi-role-1', projectId: null }
                  : null,
            )) as never);
          repository.findProjectById.mockResolvedValue({ projectId: 'manager-project-1' } as never);

          await expect(
            service.updateUser('user-1', {
              roleCode: 'MANAGER',
              projectId: 'manager-project-1',
              phoneNumber: '+919876544139',
            }),
          ).rejects.toMatchObject({ status: 400 });
          expect(repository.updateUserTransaction).not.toHaveBeenCalled();
        });
      });

      it('maps a duplicate employeeCode to a 409 conflict', async () => {
        repository.findSakhiProfileByUserId.mockResolvedValue({ id: 'sakhi-profile-1' } as never);
        repository.updateUserTransaction.mockRejectedValue({ code: 'P2002' });

        await expect(
          service.updateUser('user-1', { employeeCode: 'EMP-00999' }),
        ).rejects.toMatchObject({ status: 409 });
      });

      it('updates supervisorId as a plain scalar with no FK validation', async () => {
        repository.findSakhiProfileByUserId.mockResolvedValue({ id: 'sakhi-profile-1' } as never);
        repository.updateUserTransaction.mockResolvedValue(updatedUserRow() as never);

        await service.updateUser('user-1', { supervisorId: 'supervisor-2' });

        expect(repository.updateUserTransaction).toHaveBeenCalledWith('user-1', {
          user: {},
          userRole: undefined,
          sakhiProfile: { id: 'sakhi-profile-1', data: { supervisorId: 'supervisor-2' } },
          revokeSessions: false,
        });
      });

      it('encrypts panNumber/aadhaarNumber/bankAccountNumber before persisting, never storing plaintext', async () => {
        repository.findSakhiProfileByUserId.mockResolvedValue({ id: 'sakhi-profile-1' } as never);
        repository.updateUserTransaction.mockResolvedValue(updatedUserRow() as never);

        await service.updateUser('user-1', {
          panNumber: 'ABCDE1234F',
          aadhaarNumber: '123456789012',
          bankAccountNumber: '000111222333',
        });

        const call = repository.updateUserTransaction.mock.calls[0][1] as {
          sakhiProfile: { data: Record<string, unknown> };
        };
        expect(call.sakhiProfile.data.panToken).toBeInstanceOf(Buffer);
        expect(call.sakhiProfile.data.aadhaarToken).toBeInstanceOf(Buffer);
        expect(call.sakhiProfile.data.bankAccountToken).toBeInstanceOf(Buffer);
        expect((call.sakhiProfile.data.panToken as Buffer).toString()).not.toContain('ABCDE1234F');
      });

      it('updates activeFrom/activeTo as Date objects', async () => {
        repository.findSakhiProfileByUserId.mockResolvedValue({ id: 'sakhi-profile-1' } as never);
        repository.updateUserTransaction.mockResolvedValue(updatedUserRow() as never);

        await service.updateUser('user-1', { activeFrom: '2026-01-01', activeTo: '2026-12-31' });

        expect(repository.updateUserTransaction).toHaveBeenCalledWith('user-1', {
          user: {},
          userRole: undefined,
          sakhiProfile: {
            id: 'sakhi-profile-1',
            data: { activeFrom: new Date('2026-01-01'), activeTo: new Date('2026-12-31') },
          },
          revokeSessions: false,
        });
      });
    });

    it('applies users, user_roles, sakhi_profiles, and session revocation together in one transaction', async () => {
      repository.findActiveUserRole.mockResolvedValue({ id: 'user-role-1' } as never);
      repository.findSakhiProfileByUserId.mockResolvedValue({ id: 'sakhi-profile-1' } as never);
      repository.updateUserTransaction.mockResolvedValue(updatedUserRow() as never);

      await service.updateUser('user-1', {
        username: 'new.username',
        roleCode: 'SAKHI',
        geographyUnitId: 'geo-2',
        employeeCode: 'EMP-00999',
      });

      expect(repository.updateUserTransaction).toHaveBeenCalledWith('user-1', {
        user: { username: 'new.username' },
        userRole: { id: 'user-role-1', data: { geographyUnitId: 'geo-2' } },
        sakhiProfile: { id: 'sakhi-profile-1', data: { employeeCode: 'EMP-00999' } },
        revokeSessions: true,
      });
    });
  });

  describe('reactivateUser', () => {
    const ADMIN_CALLER = { id: 'admin-1', roles: ['ADMIN'] };
    const SUPERVISOR_CALLER = { id: 'supervisor-1', roles: ['SUPERVISOR'] };

    function sakhiRow(overrides: Record<string, unknown> = {}) {
      return {
        ...ACTIVE_USER,
        status: 'INACTIVE',
        sakhiProfile: { id: 'sakhi-profile-1', supervisorId: 'supervisor-1' },
        ...overrides,
      };
    }

    it('reactivates an INACTIVE Sakhi and returns the full profile', async () => {
      repository.findUserByIdWithProfile.mockResolvedValueOnce(sakhiRow() as never);
      repository.reactivateUser.mockResolvedValue(true);
      repository.findUserByIdWithProfile.mockResolvedValueOnce(updatedUserRow() as never);

      const result = await service.reactivateUser('user-1', ADMIN_CALLER);

      expect(repository.reactivateUser).toHaveBeenCalledWith('user-1');
      expect(result.status).toBe('ACTIVE');
    });

    it.each(['INACTIVE', 'LOCKED', 'PAUSED'])('reactivates a %s Sakhi', async (status) => {
      repository.findUserByIdWithProfile.mockResolvedValueOnce(sakhiRow({ status }) as never);
      repository.reactivateUser.mockResolvedValue(true);
      repository.findUserByIdWithProfile.mockResolvedValueOnce(updatedUserRow() as never);

      await expect(service.reactivateUser('user-1', ADMIN_CALLER)).resolves.toMatchObject({
        status: 'ACTIVE',
      });
    });

    it('404s when the user does not exist', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue(null);
      await expect(service.reactivateUser('missing', ADMIN_CALLER)).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.reactivateUser).not.toHaveBeenCalled();
    });

    it('404s for a soft-deleted user', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue(sakhiRow({ isDeleted: true }) as never);
      await expect(service.reactivateUser('user-1', ADMIN_CALLER)).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.reactivateUser).not.toHaveBeenCalled();
    });

    it('403s when the target is not a Sakhi account', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue(
        sakhiRow({ userRoles: [{ role: { roleCode: 'SUPERVISOR' } }] }) as never,
      );
      await expect(service.reactivateUser('user-1', ADMIN_CALLER)).rejects.toMatchObject({
        status: 403,
      });
      expect(repository.reactivateUser).not.toHaveBeenCalled();
    });

    it('403s when a SUPERVISOR targets a Sakhi outside their own roster', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue(
        sakhiRow({
          sakhiProfile: { id: 'sakhi-profile-1', supervisorId: 'some-other-supervisor' },
        }) as never,
      );
      await expect(service.reactivateUser('user-1', SUPERVISOR_CALLER)).rejects.toMatchObject({
        status: 403,
      });
      expect(repository.reactivateUser).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR to reactivate a Sakhi in their own roster', async () => {
      repository.findUserByIdWithProfile.mockResolvedValueOnce(sakhiRow() as never);
      repository.reactivateUser.mockResolvedValue(true);
      repository.findUserByIdWithProfile.mockResolvedValueOnce(updatedUserRow() as never);

      await expect(service.reactivateUser('user-1', SUPERVISOR_CALLER)).resolves.toMatchObject({
        status: 'ACTIVE',
      });
    });

    it('409s when the user is already ACTIVE', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue(sakhiRow({ status: 'ACTIVE' }) as never);
      await expect(service.reactivateUser('user-1', ADMIN_CALLER)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.reactivateUser).not.toHaveBeenCalled();
    });

    it('409s for a DELETED account — never silently reactivated', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue(
        sakhiRow({ status: 'DELETED' }) as never,
      );
      await expect(service.reactivateUser('user-1', ADMIN_CALLER)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.reactivateUser).not.toHaveBeenCalled();
    });

    it('409s when the conditional update races with a concurrent status change', async () => {
      repository.findUserByIdWithProfile.mockResolvedValue(sakhiRow() as never);
      repository.reactivateUser.mockResolvedValue(false);
      await expect(service.reactivateUser('user-1', ADMIN_CALLER)).rejects.toMatchObject({
        status: 409,
      });
    });
  });

  describe('issueServiceToken', () => {
    const ACTIVE_SERVICE_ACCOUNT = {
      id: 'service-account-1',
      name: 'visit-form-service',
      clientId: 'visit-form-service',
      clientSecretHash: 'hashed-secret',
      role: 'SYSTEM',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    it('issues a SYSTEM-role token on correct clientId/clientSecret', async () => {
      repository.findServiceAccountByClientId.mockResolvedValue(ACTIVE_SERVICE_ACCOUNT as never);
      (verifyPassword as jest.Mock).mockResolvedValue(true);

      const result = await service.issueServiceToken({
        clientId: 'visit-form-service',
        clientSecret: 'correct',
      });

      expect(result).toEqual({
        accessToken: 'signed-access-token',
        expiresIn: 900,
        roles: ['SYSTEM'],
      });
      expect(signer.sign).toHaveBeenCalledWith(
        { sub: 'service-account-1', roles: ['SYSTEM'], typ: 'service' },
        '15m',
      );
      expect(repository.recordSuccessfulServiceAuth).toHaveBeenCalledWith('service-account-1');
      expect(repository.incrementServiceAccountFailedAuthCount).not.toHaveBeenCalled();
    });

    it('401s on an unknown clientId — same generic message as a bad secret', async () => {
      repository.findServiceAccountByClientId.mockResolvedValue(null);

      await expect(
        service.issueServiceToken({ clientId: 'unknown', clientSecret: 'anything' }),
      ).rejects.toMatchObject({ status: 401, message: 'Invalid credentials.' });
      expect(signer.sign).not.toHaveBeenCalled();
      // No account id to attach a failed-attempt count to.
      expect(repository.incrementServiceAccountFailedAuthCount).not.toHaveBeenCalled();
    });

    it('401s on a correct clientId with the wrong secret, and records the failed attempt', async () => {
      repository.findServiceAccountByClientId.mockResolvedValue(ACTIVE_SERVICE_ACCOUNT as never);
      (verifyPassword as jest.Mock).mockResolvedValue(false);

      await expect(
        service.issueServiceToken({ clientId: 'visit-form-service', clientSecret: 'wrong' }),
      ).rejects.toMatchObject({ status: 401, message: 'Invalid credentials.' });
      expect(signer.sign).not.toHaveBeenCalled();
      expect(repository.incrementServiceAccountFailedAuthCount).toHaveBeenCalledWith(
        'service-account-1',
      );
    });

    it('401s on a deactivated service account, even with the correct secret, and records the failed attempt', async () => {
      repository.findServiceAccountByClientId.mockResolvedValue({
        ...ACTIVE_SERVICE_ACCOUNT,
        isActive: false,
      } as never);
      (verifyPassword as jest.Mock).mockResolvedValue(true);

      await expect(
        service.issueServiceToken({ clientId: 'visit-form-service', clientSecret: 'correct' }),
      ).rejects.toMatchObject({ status: 401, message: 'Invalid credentials.' });
      expect(signer.sign).not.toHaveBeenCalled();
      expect(repository.incrementServiceAccountFailedAuthCount).toHaveBeenCalledWith(
        'service-account-1',
      );
    });
  });
});
