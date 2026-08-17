import { SyncPendingService } from './syncPending.service';
import type { SyncPendingRepository, PendingSyncItem } from './syncPending.repository';

describe('SyncPendingService', () => {
  const repository = {
    findPending: jest.fn(),
  } as unknown as jest.Mocked<SyncPendingRepository>;
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
    service = new SyncPendingService(repository);
  });

  it('defaults to the caller id when no userId is requested', async () => {
    repository.findPending.mockResolvedValue([pendingRow]);

    const result = await service.listPending(undefined, callerId);

    expect(repository.findPending).toHaveBeenCalledTimes(1);
    expect(repository.findPending).toHaveBeenCalledWith(callerId);
    expect(result).toEqual([pendingRow]);
  });

  it('uses the explicit userId when provided, ignoring the caller id', async () => {
    repository.findPending.mockResolvedValue([pendingRow]);

    const result = await service.listPending(otherUserId, callerId);

    expect(repository.findPending).toHaveBeenCalledTimes(1);
    expect(repository.findPending).toHaveBeenCalledWith(otherUserId);
    expect(result).toEqual([pendingRow]);
  });

  it('returns an empty array when the user has no outstanding sync items', async () => {
    repository.findPending.mockResolvedValue([]);

    const result = await service.listPending(undefined, callerId);

    expect(result).toEqual([]);
  });

  it('propagates repository errors', async () => {
    repository.findPending.mockRejectedValue(new Error('db down'));

    await expect(service.listPending(undefined, callerId)).rejects.toThrow('db down');
  });
});
