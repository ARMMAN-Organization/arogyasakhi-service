import type { AuthenticatedUser } from '@armman/service-commons';
import { SyncPendingService } from './syncPending.service';
import type { SyncPendingRepository, PendingSyncItem } from './syncPending.repository';
import { SakhiClient } from './sakhi.client';

const AUTH_HEADER = 'Bearer test-token';

function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    roles: ['SAKHI'],
    projectId: null,
    geographyUnitId: null,
    ...overrides,
  };
}

describe('SyncPendingService', () => {
  const repository = {
    findPending: jest.fn(),
  } as unknown as jest.Mocked<SyncPendingRepository>;
  const sakhiClient = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<SakhiClient>;
  let service: SyncPendingService;

  const callerId = '33333333-3333-3333-3333-333333333333';
  const otherUserId = '44444444-4444-4444-4444-444444444444';

  const pendingRow: PendingSyncItem = {
    id: '11111111-1111-1111-1111-111111111111',
    syncBatchId: '22222222-2222-2222-2222-222222222222',
    localEntityUuid: 'local-uuid-1',
    entityType: 'BENEFICIARY_CASE',
    entityId: '55555555-5555-5555-5555-555555555555',
    operation: 'UPSERT',
    status: 'QUEUED',
    errorCode: null,
    retryCount: 0,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    deviceId: '66666666-6666-6666-6666-666666666666',
    startedAt: new Date('2026-08-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SyncPendingService(repository, sakhiClient);
  });

  it('defaults to the caller id when no userId is requested', async () => {
    repository.findPending.mockResolvedValue([pendingRow]);

    const result = await service.listPending(undefined, caller({ id: callerId }), AUTH_HEADER);

    expect(repository.findPending).toHaveBeenCalledTimes(1);
    expect(repository.findPending).toHaveBeenCalledWith(callerId);
    expect(result).toEqual([pendingRow]);
  });

  it('allows a caller to explicitly request their own userId', async () => {
    repository.findPending.mockResolvedValue([pendingRow]);

    const result = await service.listPending(callerId, caller({ id: callerId }), AUTH_HEADER);

    expect(repository.findPending).toHaveBeenCalledWith(callerId);
    expect(result).toEqual([pendingRow]);
  });

  it('403s a SAKHI caller requesting a different userId, without calling the repository', async () => {
    await expect(
      service.listPending(otherUserId, caller({ id: callerId, roles: ['SAKHI'] }), AUTH_HEADER),
    ).rejects.toThrow('You do not have access to this user.');
    expect(repository.findPending).not.toHaveBeenCalled();
  });

  it("allows a SUPERVISOR to request a userId belonging to a Sakhi on their own roster", async () => {
    sakhiClient.findById.mockResolvedValue({ sakhiId: otherUserId, supervisorId: callerId });
    repository.findPending.mockResolvedValue([pendingRow]);

    const result = await service.listPending(
      otherUserId,
      caller({ id: callerId, roles: ['SUPERVISOR'] }),
      AUTH_HEADER,
    );

    expect(sakhiClient.findById).toHaveBeenCalledWith(otherUserId, AUTH_HEADER);
    expect(repository.findPending).toHaveBeenCalledWith(otherUserId);
    expect(result).toEqual([pendingRow]);
  });

  it("403s a SUPERVISOR requesting a userId not on their own roster", async () => {
    sakhiClient.findById.mockResolvedValue({ sakhiId: otherUserId, supervisorId: 'someone-else' });

    await expect(
      service.listPending(otherUserId, caller({ id: callerId, roles: ['SUPERVISOR'] }), AUTH_HEADER),
    ).rejects.toThrow('You do not have access to this user.');
    expect(repository.findPending).not.toHaveBeenCalled();
  });

  it('403s a SUPERVISOR requesting a userId that is not a Sakhi at all', async () => {
    sakhiClient.findById.mockResolvedValue(null);

    await expect(
      service.listPending(otherUserId, caller({ id: callerId, roles: ['SUPERVISOR'] }), AUTH_HEADER),
    ).rejects.toThrow('You do not have access to this user.');
  });

  it('returns an empty array when the user has no outstanding sync items', async () => {
    repository.findPending.mockResolvedValue([]);

    const result = await service.listPending(undefined, caller({ id: callerId }), AUTH_HEADER);

    expect(result).toEqual([]);
  });

  it('propagates repository errors', async () => {
    repository.findPending.mockRejectedValue(new Error('db down'));

    await expect(
      service.listPending(undefined, caller({ id: callerId }), AUTH_HEADER),
    ).rejects.toThrow('db down');
  });
});
