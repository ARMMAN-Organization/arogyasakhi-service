import { SyncPendingRepository } from './syncPending.repository';

describe('SyncPendingRepository', () => {
  const findMany = jest.fn();
  const prisma = { syncItem: { findMany } } as never;
  let repository: SyncPendingRepository;

  const userId = '33333333-3333-3333-3333-333333333333';

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new SyncPendingRepository(prisma);
  });

  it('queries non-deleted, still-outstanding sync items for the given userId, newest first', async () => {
    findMany.mockResolvedValue([]);

    await repository.findPending(userId);

    expect(findMany).toHaveBeenCalledWith({
      where: {
        isDeleted: false,
        status: { in: ['QUEUED', 'FAILED', 'SKIPPED'] },
        syncBatch: { userId },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        syncBatch: { select: { deviceId: true, startedAt: true } },
      },
    });
  });

  it('excludes DUPLICATE and PARTIAL — neither is a genuinely outstanding item', async () => {
    findMany.mockResolvedValue([]);

    await repository.findPending(userId);

    const call = findMany.mock.calls[0][0];
    expect(call.where.status.in).not.toContain('DUPLICATE');
    expect(call.where.status.in).not.toContain('PARTIAL');
  });

  it('flattens the parent batch deviceId/startedAt onto each row', async () => {
    const createdAt = new Date('2026-08-01T00:00:00.000Z');
    const startedAt = new Date('2026-07-31T23:00:00.000Z');
    findMany.mockResolvedValue([
      {
        id: '11111111-1111-1111-1111-111111111111',
        syncBatchId: '22222222-2222-2222-2222-222222222222',
        localEntityUuid: 'local-uuid-1',
        entityType: 'BENEFICIARY_CASE',
        entityId: '55555555-5555-5555-5555-555555555555',
        operation: 'UPSERT',
        status: 'FAILED',
        errorCode: 'CONFLICT',
        retryCount: 2,
        createdAt,
        syncBatch: {
          deviceId: '66666666-6666-6666-6666-666666666666',
          startedAt,
        },
      },
    ]);

    const result = await repository.findPending(userId);

    expect(result).toEqual([
      {
        id: '11111111-1111-1111-1111-111111111111',
        syncBatchId: '22222222-2222-2222-2222-222222222222',
        localEntityUuid: 'local-uuid-1',
        entityType: 'BENEFICIARY_CASE',
        entityId: '55555555-5555-5555-5555-555555555555',
        operation: 'UPSERT',
        status: 'FAILED',
        errorCode: 'CONFLICT',
        retryCount: 2,
        createdAt,
        deviceId: '66666666-6666-6666-6666-666666666666',
        startedAt,
      },
    ]);
  });

  it('returns an empty array when the user has no outstanding sync items', async () => {
    findMany.mockResolvedValue([]);

    const result = await repository.findPending(userId);

    expect(result).toEqual([]);
  });
});
