import { StaleSakhisRepository } from './staleSakhis.repository';

describe('StaleSakhisRepository', () => {
  const queryRaw = jest.fn();
  const prisma = { $queryRaw: queryRaw } as never;
  let repository: StaleSakhisRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new StaleSakhisRepository(prisma);
  });

  it('returns an empty array without querying when the roster is empty', async () => {
    const result = await repository.findStale([], 3);

    expect(result).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it('maps raw rows to StaleSakhi, coercing bigint counts to numbers', async () => {
    const lastSyncAt = new Date('2026-08-01T00:00:00.000Z');
    queryRaw.mockResolvedValue([
      {
        user_id: 'sakhi-a',
        last_sync_at: lastSyncAt,
        days_since_sync: 20,
        pending_count: BigInt(12),
        failed_count: BigInt(3),
      },
    ]);

    const result = await repository.findStale(['sakhi-a'], 3);

    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(result).toEqual([
      {
        userId: 'sakhi-a',
        lastSyncAt,
        daysSinceSync: 20,
        pendingCount: 12,
        failedCount: 3,
      },
    ]);
  });

  it('returns an empty array when no roster user is stale', async () => {
    queryRaw.mockResolvedValue([]);

    const result = await repository.findStale(['sakhi-a'], 3);

    expect(result).toEqual([]);
  });
});
