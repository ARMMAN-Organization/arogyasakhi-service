import type { AuthenticatedUser, ServiceTokenClient } from '@armman/service-commons';
import { SyncBatchService } from './syncBatch.service';
import type { SyncBatchRepository } from './syncBatch.repository';
import type { CreateSyncBatchInput } from './dto/create-syncBatch.dto';
import { listSakhiIdsForSupervisor } from './sakhi.client';
import { createSyncDelayEscalationEvent } from './systemEscalation.client';

jest.mock('./sakhi.client');
jest.mock('./systemEscalation.client');

const AUTH_HEADER = 'Bearer test-token';
const CALLER_ID = '99999999-9999-9999-9999-999999999999';

function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: CALLER_ID,
    roles: ['SAKHI'],
    projectId: null,
    geographyUnitId: null,
    ...overrides,
  };
}

describe('SyncBatchService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
    findLastSyncedAt: jest.fn(),
    findLastSyncedAtByUserIds: jest.fn(),
  } as unknown as jest.Mocked<SyncBatchRepository>;
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);
  const createSyncDelayEscalationEventMock = jest.mocked(createSyncDelayEscalationEvent);
  let service: SyncBatchService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SyncBatchService(repository, null, 48);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns the repository list unchanged', async () => {
    const rows = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        deviceId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        direction: 'UPLOAD' as const,
        startedAt: new Date(),
        completedAt: null,
        status: 'STARTED' as const,
        appVersion: '1.0.0',
        networkType: 'WIFI' as const,
        createdAt: new Date(),
        createdByUserId: null,
        updatedAt: new Date(),
        updatedByUserId: null,
        isDeleted: false,
        deletedAt: null,
      },
    ];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('creates via repository with the given data', async () => {
    const dto: CreateSyncBatchInput = {
      deviceId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
      direction: 'UPLOAD',
      startedAt: new Date(),
      status: 'STARTED',
      appVersion: '1.0.0',
      networkType: 'WIFI',
    };
    const created = {
      id: '11111111-1111-1111-1111-111111111111',
      deviceId: dto.deviceId,
      userId: dto.userId,
      direction: dto.direction,
      startedAt: dto.startedAt,
      completedAt: null as Date | null,
      status: dto.status,
      appVersion: dto.appVersion ?? null,
      networkType: dto.networkType ?? null,
      createdAt: new Date(),
      createdByUserId: null as string | null,
      updatedAt: new Date(),
      updatedByUserId: null as string | null,
      isDeleted: false,
      deletedAt: null as Date | null,
    };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.create({
        deviceId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        direction: 'UPLOAD',
        startedAt: new Date(),
        status: 'STARTED',
      }),
    ).rejects.toThrow('db down');
  });

  describe('getLastSyncedAt', () => {
    it('allows a SAKHI caller to view their own last-synced time', async () => {
      const completedAt = new Date('2026-08-01T10:00:00.000Z');
      repository.findLastSyncedAt.mockResolvedValue(completedAt);

      const result = await service.getLastSyncedAt(CALLER_ID, caller(), AUTH_HEADER);

      expect(repository.findLastSyncedAt).toHaveBeenCalledWith(CALLER_ID);
      expect(result).toBe(completedAt);
    });

    it('403s when a SAKHI caller queries a different userId', async () => {
      await expect(
        service.getLastSyncedAt('some-other-user', caller(), AUTH_HEADER),
      ).rejects.toThrow('A Sakhi may only view their own last-synced time.');
      expect(repository.findLastSyncedAt).not.toHaveBeenCalled();
    });

    it('returns null when the user has never completed a sync', async () => {
      repository.findLastSyncedAt.mockResolvedValue(null);
      const result = await service.getLastSyncedAt(CALLER_ID, caller(), AUTH_HEADER);
      expect(result).toBeNull();
    });

    it('allows a SUPERVISOR to view a roster Sakhi', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.findLastSyncedAt.mockResolvedValue(null);

      await service.getLastSyncedAt(
        'sakhi-a',
        caller({ roles: ['SUPERVISOR'], projectId: 'project-1' }),
        AUTH_HEADER,
      );

      expect(repository.findLastSyncedAt).toHaveBeenCalledWith('sakhi-a');
    });

    it('403s when a SUPERVISOR queries a userId outside their roster', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);

      await expect(
        service.getLastSyncedAt(
          'sakhi-outside',
          caller({ roles: ['SUPERVISOR'], projectId: 'project-1' }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow("userId is not in this Supervisor's roster.");
      expect(repository.findLastSyncedAt).not.toHaveBeenCalled();
    });

    it('rejects a SUPERVISOR caller with no project scope', async () => {
      await expect(
        service.getLastSyncedAt(
          'sakhi-a',
          caller({ roles: ['SUPERVISOR'], projectId: null }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow('Supervisor caller has no project scope.');
    });

    it('leaves a MANAGER/ADMIN caller unscoped — no roster lookup made', async () => {
      repository.findLastSyncedAt.mockResolvedValue(null);

      await service.getLastSyncedAt('any-user', caller({ roles: ['MANAGER'] }), AUTH_HEADER);

      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
      expect(repository.findLastSyncedAt).toHaveBeenCalledWith('any-user');
    });

    it(
      'leaves a caller holding both MANAGER and SAKHI unscoped — regression: the SAKHI ' +
        'branch must not run ahead of the privileged-role check',
      async () => {
        repository.findLastSyncedAt.mockResolvedValue(null);

        await service.getLastSyncedAt(
          'some-other-user',
          caller({ id: 'sakhi-1', roles: ['MANAGER', 'SAKHI'] }),
          AUTH_HEADER,
        );

        expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
        expect(repository.findLastSyncedAt).toHaveBeenCalledWith('some-other-user');
      },
    );
  });

  describe('getLastSyncedAtByRoster', () => {
    const SUPERVISOR = caller({ roles: ['SUPERVISOR'], projectId: 'project-1' });

    it('rejects a SUPERVISOR caller with no project scope', async () => {
      await expect(
        service.getLastSyncedAtByRoster(
          caller({ roles: ['SUPERVISOR'], projectId: null }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow('Supervisor caller has no project scope.');
    });

    it('flags a roster member as delayed when they have never synced', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);
      repository.findLastSyncedAtByUserIds.mockResolvedValue(new Map());

      const result = await service.getLastSyncedAtByRoster(SUPERVISOR, AUTH_HEADER);

      expect(result).toEqual([{ userId: 'sakhi-a', lastSyncedAt: null, isDelayed: true }]);
    });

    it('flags a roster member as delayed when their last sync exceeds the threshold', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);
      const oldSync = new Date(Date.now() - 72 * 60 * 60 * 1000);
      repository.findLastSyncedAtByUserIds.mockResolvedValue(new Map([['sakhi-a', oldSync]]));

      const result = await service.getLastSyncedAtByRoster(SUPERVISOR, AUTH_HEADER);

      expect(result).toEqual([{ userId: 'sakhi-a', lastSyncedAt: oldSync, isDelayed: true }]);
    });

    it('does not flag a roster member synced within the threshold', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);
      const recentSync = new Date(Date.now() - 1 * 60 * 60 * 1000);
      repository.findLastSyncedAtByUserIds.mockResolvedValue(new Map([['sakhi-a', recentSync]]));

      const result = await service.getLastSyncedAtByRoster(SUPERVISOR, AUTH_HEADER);

      expect(result).toEqual([{ userId: 'sakhi-a', lastSyncedAt: recentSync, isDelayed: false }]);
    });

    it('does not attempt to raise an escalation when no service token client is configured', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);
      repository.findLastSyncedAtByUserIds.mockResolvedValue(new Map());

      await service.getLastSyncedAtByRoster(SUPERVISOR, AUTH_HEADER);

      expect(createSyncDelayEscalationEventMock).not.toHaveBeenCalled();
    });

    it('raises a SYNC_DELAY escalation for each delayed roster member when a token client is configured', async () => {
      const tokenClient = {
        getToken: jest.fn().mockResolvedValue('system-token'),
      } as unknown as ServiceTokenClient;
      service = new SyncBatchService(repository, tokenClient, 48);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      const recentSync = new Date();
      repository.findLastSyncedAtByUserIds.mockResolvedValue(new Map([['sakhi-b', recentSync]]));
      createSyncDelayEscalationEventMock.mockResolvedValue({
        id: 'event-1',
        sakhiUserId: 'sakhi-a',
        escalationType: 'SYNC_DELAY',
        status: 'OPEN',
      });

      await service.getLastSyncedAtByRoster(SUPERVISOR, AUTH_HEADER);

      expect(createSyncDelayEscalationEventMock).toHaveBeenCalledTimes(1);
      expect(createSyncDelayEscalationEventMock).toHaveBeenCalledWith('sakhi-a', 'system-token');
    });

    it('does not fail the read when raising an escalation throws', async () => {
      const tokenClient = {
        getToken: jest.fn().mockResolvedValue('system-token'),
      } as unknown as ServiceTokenClient;
      service = new SyncBatchService(repository, tokenClient, 48);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);
      repository.findLastSyncedAtByUserIds.mockResolvedValue(new Map());
      createSyncDelayEscalationEventMock.mockRejectedValue(new Error('boom'));

      const result = await service.getLastSyncedAtByRoster(SUPERVISOR, AUTH_HEADER);

      expect(result).toEqual([{ userId: 'sakhi-a', lastSyncedAt: null, isDelayed: true }]);
    });
  });
});
