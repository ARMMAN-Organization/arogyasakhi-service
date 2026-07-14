import { AuthService } from './auth.service';
import type { AuthRepository } from './auth.repository';
import type { TokenSigner } from '@armman/service-commons';

jest.mock('./password', () => ({
  verifyPassword: jest.fn(),
}));
jest.mock('./refresh-token', () => ({
  generateRefreshToken: jest.fn(() => 'plain-refresh-token'),
  hashRefreshToken: jest.fn((token: string) => `hashed(${token})`),
}));

import { verifyPassword } from './password';

const ACTIVE_USER = {
  id: 'user-1',
  mobileNumber: '+919876543210',
  passwordHash: 'hashed-password',
  displayName: 'Test Sakhi',
  status: 'ACTIVE' as const,
  isDeleted: false,
  userRoles: [
    {
      projectId: 'project-1',
      geographyUnitId: 'geo-1',
      role: { roleCode: 'SAKHI' },
    },
  ],
};

describe('AuthService', () => {
  const repository = {
    findUserByMobileNumber: jest.fn(),
    findUserById: jest.fn(),
    incrementFailedLoginCount: jest.fn(),
    recordSuccessfulLogin: jest.fn(),
    createSession: jest.fn(),
    findActiveSessionByRefreshTokenHash: jest.fn(),
    revokeSession: jest.fn(),
    revokeSessionByRefreshTokenHash: jest.fn(),
  } as unknown as jest.Mocked<AuthRepository>;

  const signer = {
    sign: jest.fn(),
    verify: jest.fn(),
  } as unknown as jest.Mocked<TokenSigner>;

  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    signer.sign.mockResolvedValue('signed-access-token');
    service = new AuthService(repository, signer, '15m', '30d');
  });

  describe('login', () => {
    it('issues tokens on correct mobile number and password', async () => {
      repository.findUserByMobileNumber.mockResolvedValue(ACTIVE_USER as never);
      (verifyPassword as jest.Mock).mockResolvedValue(true);

      const tokens = await service.login(
        { mobileNumber: '+919876543210', password: 'correct' },
        '127.0.0.1',
      );

      expect(tokens).toEqual({
        accessToken: 'signed-access-token',
        refreshToken: 'plain-refresh-token',
      });
      expect(repository.recordSuccessfulLogin).toHaveBeenCalledWith('user-1');
      expect(repository.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          refreshTokenHash: 'hashed(plain-refresh-token)',
        }),
      );
      expect(signer.sign).toHaveBeenCalledWith(
        { sub: 'user-1', roles: ['SAKHI'], projectId: 'project-1', geographyUnitId: 'geo-1' },
        '15m',
      );
    });

    it('rejects with a generic error for a non-existent mobile number', async () => {
      repository.findUserByMobileNumber.mockResolvedValue(null);

      await expect(
        service.login({ mobileNumber: '+919999999999', password: 'anything' }, null),
      ).rejects.toMatchObject({ status: 401, message: 'Invalid mobile number or password.' });
      expect(repository.incrementFailedLoginCount).not.toHaveBeenCalled();
    });

    it('increments failedLoginCount and rejects on wrong password', async () => {
      repository.findUserByMobileNumber.mockResolvedValue(ACTIVE_USER as never);
      (verifyPassword as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ mobileNumber: '+919876543210', password: 'wrong' }, null),
      ).rejects.toMatchObject({ status: 401 });
      expect(repository.incrementFailedLoginCount).toHaveBeenCalledWith('user-1');
      expect(repository.recordSuccessfulLogin).not.toHaveBeenCalled();
    });

    it('rejects a LOCKED user regardless of password correctness', async () => {
      repository.findUserByMobileNumber.mockResolvedValue({
        ...ACTIVE_USER,
        status: 'LOCKED',
      } as never);

      await expect(
        service.login({ mobileNumber: '+919876543210', password: 'correct' }, null),
      ).rejects.toMatchObject({ status: 401 });
      expect(verifyPassword).not.toHaveBeenCalled();
      expect(repository.incrementFailedLoginCount).toHaveBeenCalledWith('user-1');
    });

    it('rejects a soft-deleted user', async () => {
      repository.findUserByMobileNumber.mockResolvedValue({
        ...ACTIVE_USER,
        isDeleted: true,
      } as never);

      await expect(
        service.login({ mobileNumber: '+919876543210', password: 'correct' }, null),
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  describe('refresh', () => {
    const ACTIVE_SESSION = {
      id: 'session-1',
      userId: 'user-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    };

    it('rotates the refresh token and issues a new pair on a valid token', async () => {
      repository.findActiveSessionByRefreshTokenHash.mockResolvedValue(ACTIVE_SESSION as never);
      repository.findUserById.mockResolvedValue(ACTIVE_USER as never);

      const tokens = await service.refresh('presented-refresh-token', '127.0.0.1');

      expect(repository.revokeSession).toHaveBeenCalledWith('session-1');
      expect(tokens).toEqual({
        accessToken: 'signed-access-token',
        refreshToken: 'plain-refresh-token',
      });
    });

    it('rejects an expired refresh token', async () => {
      repository.findActiveSessionByRefreshTokenHash.mockResolvedValue({
        ...ACTIVE_SESSION,
        expiresAt: new Date(Date.now() - 1000),
      } as never);

      await expect(service.refresh('expired-token', null)).rejects.toMatchObject({ status: 401 });
      expect(repository.revokeSession).not.toHaveBeenCalled();
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

  describe('getProfile', () => {
    it('returns the profile with role/project/geography scope', async () => {
      repository.findUserById.mockResolvedValue(ACTIVE_USER as never);

      await expect(service.getProfile('user-1')).resolves.toEqual({
        id: 'user-1',
        displayName: 'Test Sakhi',
        mobileNumber: '+919876543210',
        roles: [{ roleCode: 'SAKHI', projectId: 'project-1', geographyUnitId: 'geo-1' }],
      });
    });

    it('returns null for a soft-deleted user', async () => {
      repository.findUserById.mockResolvedValue({ ...ACTIVE_USER, isDeleted: true } as never);
      await expect(service.getProfile('user-1')).resolves.toBeNull();
    });

    it('returns null for a non-existent user', async () => {
      repository.findUserById.mockResolvedValue(null);
      await expect(service.getProfile('missing')).resolves.toBeNull();
    });
  });
});
