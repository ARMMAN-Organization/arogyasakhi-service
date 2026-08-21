const appConfigMock: { DEFAULT_TRANSFER_MANAGER_EMAIL?: string } = {
  DEFAULT_TRANSFER_MANAGER_EMAIL: 'default-manager@example.com',
};
jest.mock('../config/app-config', () => ({ appConfig: appConfigMock }));

const sendTransferNoticeEmailMock = jest.fn();
jest.mock('./ses-email.client', () => ({
  sendTransferNoticeEmail: (...args: unknown[]) => sendTransferNoticeEmailMock(...args),
}));

import { SupervisorService } from './supervisor.service';
import type { SupervisorRepository } from './supervisor.repository';
import type { AuthenticatedUser } from '@armman/service-commons';

function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: '55555555-5555-5555-5555-555555555555',
    roles: ['SUPERVISOR'],
    projectId: null,
    geographyUnitId: null,
    ...overrides,
  };
}

describe('SupervisorService', () => {
  const repository = {
    findActiveUserRole: jest.fn(),
    findUserById: jest.fn(),
    findSupervisorProfileByUserId: jest.fn(),
    findSakhiProfileByUserId: jest.fn(),
    upsertManager: jest.fn(),
  } as unknown as jest.Mocked<SupervisorRepository>;
  let service: SupervisorService;

  beforeEach(() => {
    jest.clearAllMocks();
    appConfigMock.DEFAULT_TRANSFER_MANAGER_EMAIL = 'default-manager@example.com';
    service = new SupervisorService(repository);
  });

  describe('setManager', () => {
    const supervisorId = '11111111-1111-1111-1111-111111111111';
    const managerId = '22222222-2222-2222-2222-222222222222';
    const adminId = '33333333-3333-3333-3333-333333333333';

    it('upserts the manager link when both roles check out', async () => {
      repository.findActiveUserRole.mockResolvedValueOnce({ id: 'ur-1' } as never); // supervisor role
      repository.findUserById.mockResolvedValueOnce({ id: managerId } as never);
      repository.findActiveUserRole.mockResolvedValueOnce({ id: 'ur-2' } as never); // manager role

      const result = await service.setManager(supervisorId, managerId, adminId);

      expect(repository.upsertManager).toHaveBeenCalledWith(supervisorId, managerId, adminId);
      expect(result).toEqual({ userId: supervisorId, managerUserId: managerId });
    });

    it('422s when the target user does not hold an active SUPERVISOR role', async () => {
      repository.findActiveUserRole.mockResolvedValueOnce(null);

      await expect(service.setManager(supervisorId, managerId, adminId)).rejects.toMatchObject({
        status: 422,
      });
      expect(repository.upsertManager).not.toHaveBeenCalled();
    });

    it('404s when managerUserId does not reference an existing user', async () => {
      repository.findActiveUserRole.mockResolvedValueOnce({ id: 'ur-1' } as never);
      repository.findUserById.mockResolvedValueOnce(null);

      await expect(service.setManager(supervisorId, managerId, adminId)).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.upsertManager).not.toHaveBeenCalled();
    });

    it('422s when managerUserId does not hold an active MANAGER role', async () => {
      repository.findActiveUserRole.mockResolvedValueOnce({ id: 'ur-1' } as never);
      repository.findUserById.mockResolvedValueOnce({ id: managerId } as never);
      repository.findActiveUserRole.mockResolvedValueOnce(null);

      await expect(service.setManager(supervisorId, managerId, adminId)).rejects.toMatchObject({
        status: 422,
      });
      expect(repository.upsertManager).not.toHaveBeenCalled();
    });
  });

  describe('resolveManagerContact / sendTransferNotice', () => {
    const sakhiId = '44444444-4444-4444-4444-444444444444';
    const supervisorId = '11111111-1111-1111-1111-111111111111';
    const managerId = '22222222-2222-2222-2222-222222222222';

    function sakhiProfile(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        userId: sakhiId,
        supervisorId,
        user: { displayName: 'Priya Sharma' },
        ...overrides,
      };
    }

    it('resolves the real Manager email when the whole hierarchy is linked', async () => {
      repository.findSakhiProfileByUserId.mockResolvedValue(sakhiProfile() as never);
      repository.findSupervisorProfileByUserId.mockResolvedValue({
        managerUserId: managerId,
      } as never);
      repository.findUserById.mockResolvedValue({ email: 'manager@example.com' } as never);

      const result = await service.resolveManagerContact(sakhiId);

      expect(result).toEqual({
        email: 'manager@example.com',
        usedFallback: false,
        sakhiName: 'Priya Sharma',
      });
    });

    it('falls back to the default Manager email when the Sakhi has no Supervisor', async () => {
      repository.findSakhiProfileByUserId.mockResolvedValue(
        sakhiProfile({ supervisorId: null }) as never,
      );

      const result = await service.resolveManagerContact(sakhiId);

      expect(result).toEqual({
        email: 'default-manager@example.com',
        usedFallback: true,
        sakhiName: 'Priya Sharma',
      });
      expect(repository.findSupervisorProfileByUserId).not.toHaveBeenCalled();
    });

    it('falls back when the Supervisor has no managerUserId on file', async () => {
      repository.findSakhiProfileByUserId.mockResolvedValue(sakhiProfile() as never);
      repository.findSupervisorProfileByUserId.mockResolvedValue({ managerUserId: null } as never);

      const result = await service.resolveManagerContact(sakhiId);

      expect(result.usedFallback).toBe(true);
      expect(result.email).toBe('default-manager@example.com');
    });

    it('falls back when the resolved Manager user has no email on file', async () => {
      repository.findSakhiProfileByUserId.mockResolvedValue(sakhiProfile() as never);
      repository.findSupervisorProfileByUserId.mockResolvedValue({
        managerUserId: managerId,
      } as never);
      repository.findUserById.mockResolvedValue({ email: null } as never);

      const result = await service.resolveManagerContact(sakhiId);

      expect(result.usedFallback).toBe(true);
      expect(result.email).toBe('default-manager@example.com');
    });

    it('502s when nothing resolves and no default is configured', async () => {
      appConfigMock.DEFAULT_TRANSFER_MANAGER_EMAIL = undefined;
      repository.findSakhiProfileByUserId.mockResolvedValue(
        sakhiProfile({ supervisorId: null }) as never,
      );

      await expect(service.resolveManagerContact(sakhiId)).rejects.toMatchObject({ status: 502 });
    });

    it('404s when the sakhiId does not resolve to a Sakhi', async () => {
      repository.findSakhiProfileByUserId.mockResolvedValue(null);

      await expect(service.resolveManagerContact(sakhiId)).rejects.toMatchObject({ status: 404 });
    });

    it('404s when the sakhiId does not resolve to a Sakhi, even for a caller', async () => {
      repository.findSakhiProfileByUserId.mockResolvedValue(null);

      await expect(
        service.resolveManagerContact(sakhiId, caller({ id: supervisorId })),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('allows a SUPERVISOR caller who owns the Sakhi', async () => {
      repository.findSakhiProfileByUserId.mockResolvedValue(sakhiProfile() as never);
      repository.findSupervisorProfileByUserId.mockResolvedValue({
        managerUserId: managerId,
      } as never);
      repository.findUserById.mockResolvedValue({ email: 'manager@example.com' } as never);

      const result = await service.resolveManagerContact(sakhiId, caller({ id: supervisorId }));

      expect(result.email).toBe('manager@example.com');
    });

    it('403s a SUPERVISOR caller who does not own the Sakhi', async () => {
      repository.findSakhiProfileByUserId.mockResolvedValue(sakhiProfile() as never);

      await expect(
        service.resolveManagerContact(sakhiId, caller({ id: 'someone-else' })),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findSupervisorProfileByUserId).not.toHaveBeenCalled();
    });

    it('allows an ADMIN caller regardless of roster ownership', async () => {
      repository.findSakhiProfileByUserId.mockResolvedValue(sakhiProfile() as never);
      repository.findSupervisorProfileByUserId.mockResolvedValue({
        managerUserId: managerId,
      } as never);
      repository.findUserById.mockResolvedValue({ email: 'manager@example.com' } as never);

      const result = await service.resolveManagerContact(
        sakhiId,
        caller({ id: 'someone-else', roles: ['ADMIN'] }),
      );

      expect(result.email).toBe('manager@example.com');
    });

    it('sendTransferNotice sends via the resolved Manager email and reports usedFallback', async () => {
      repository.findSakhiProfileByUserId.mockResolvedValue(sakhiProfile() as never);
      repository.findSupervisorProfileByUserId.mockResolvedValue({
        managerUserId: managerId,
      } as never);
      repository.findUserById.mockResolvedValue({ email: 'manager@example.com' } as never);
      sendTransferNoticeEmailMock.mockResolvedValue(true);

      const result = await service.sendTransferNotice(
        {
          sakhiId,
          beneficiaryName: 'Jane Doe',
          visitsMissedCount: 2,
          visitType: 'ANC',
        },
        caller({ id: supervisorId }),
      );

      expect(sendTransferNoticeEmailMock).toHaveBeenCalledWith({
        to: 'manager@example.com',
        sakhiName: 'Priya Sharma',
        beneficiaryName: 'Jane Doe',
        visitsMissedCount: 2,
        visitType: 'ANC',
      });
      expect(result).toEqual({
        sent: true,
        managerEmail: 'manager@example.com',
        usedFallback: false,
      });
    });

    it('sendTransferNotice forbids a SUPERVISOR caller outside the Sakhi roster and sends no email', async () => {
      repository.findSakhiProfileByUserId.mockResolvedValue(sakhiProfile() as never);

      await expect(
        service.sendTransferNotice(
          {
            sakhiId,
            beneficiaryName: 'Jane Doe',
            visitsMissedCount: 2,
            visitType: 'ANC',
          },
          caller({ id: 'someone-else' }),
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(sendTransferNoticeEmailMock).not.toHaveBeenCalled();
    });

    it('sendTransferNotice succeeds for an ADMIN caller regardless of roster ownership', async () => {
      repository.findSakhiProfileByUserId.mockResolvedValue(sakhiProfile() as never);
      repository.findSupervisorProfileByUserId.mockResolvedValue({
        managerUserId: managerId,
      } as never);
      repository.findUserById.mockResolvedValue({ email: 'manager@example.com' } as never);
      sendTransferNoticeEmailMock.mockResolvedValue(true);

      const result = await service.sendTransferNotice(
        {
          sakhiId,
          beneficiaryName: 'Jane Doe',
          visitsMissedCount: 2,
          visitType: 'ANC',
        },
        caller({ id: 'someone-else', roles: ['ADMIN'] }),
      );

      expect(result.sent).toBe(true);
      expect(sendTransferNoticeEmailMock).toHaveBeenCalled();
    });
  });
});
