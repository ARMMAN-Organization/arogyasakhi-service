import { SyncItemRepository } from './syncItem.repository';

describe('SyncItemRepository', () => {
  const findFirst = jest.fn();
  const create = jest.fn();
  const findFirstBatch = jest.fn();
  const prisma = {
    syncItem: { findFirst, create },
    syncBatch: { findFirst: findFirstBatch },
  } as never;
  let repository: SyncItemRepository;

  const baseInput = {
    syncBatchId: '11111111-1111-1111-1111-111111111111',
    localEntityUuid: 'local-uuid-1',
    entityType: 'BENEFICIARY',
    operation: 'CREATE' as const,
    status: 'SUCCESS' as const,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new SyncItemRepository(prisma);
  });

  describe('create', () => {
    it('creates a new item with status SUCCESS when no prior item exists for this key', async () => {
      findFirst.mockResolvedValueOnce(null); // no prior SUCCESS
      findFirst.mockResolvedValueOnce(null); // no prior FAILED/SKIPPED attempt
      create.mockResolvedValue({
        id: 'item-1',
        localEntityUuid: 'local-uuid-1',
        entityType: 'BENEFICIARY',
        status: 'SUCCESS',
        retryCount: 0,
      });

      const result = await repository.create(baseInput);

      expect(create).toHaveBeenCalledWith({ data: { ...baseInput, retryCount: 0 } });
      expect(result.status).toBe('SUCCESS');
      expect(result.retryCount).toBe(0);
    });

    it('marks the item DUPLICATE when a SUCCESS item already exists for this (localEntityUuid, entityType), regardless of batch', async () => {
      findFirst.mockResolvedValueOnce({ id: 'prior-success-item' });
      create.mockResolvedValue({
        id: 'item-2',
        localEntityUuid: 'local-uuid-1',
        entityType: 'BENEFICIARY',
        status: 'DUPLICATE',
        retryCount: 0,
      });

      const result = await repository.create(baseInput);

      expect(create).toHaveBeenCalledWith({
        data: { ...baseInput, status: 'DUPLICATE' },
      });
      expect(result.status).toBe('DUPLICATE');
    });

    it('does not increment retryCount for a DUPLICATE item', async () => {
      findFirst.mockResolvedValueOnce({ id: 'prior-success-item' });
      create.mockResolvedValue({
        id: 'item-2',
        localEntityUuid: 'local-uuid-1',
        entityType: 'BENEFICIARY',
        status: 'DUPLICATE',
        retryCount: 0,
      });

      const result = await repository.create(baseInput);

      expect(result.retryCount).toBe(0);
      const createCall = create.mock.calls[0][0];
      expect(createCall.data.retryCount).toBeUndefined();
    });

    it('increments retryCount when resubmitting a previously FAILED item for the same key', async () => {
      findFirst.mockResolvedValueOnce(null); // no prior SUCCESS
      findFirst.mockResolvedValueOnce({ retryCount: 2 }); // prior FAILED attempt
      create.mockResolvedValue({
        id: 'item-3',
        localEntityUuid: 'local-uuid-1',
        entityType: 'BENEFICIARY',
        status: 'FAILED',
        retryCount: 3,
      });

      const result = await repository.create({ ...baseInput, status: 'FAILED' });

      expect(create).toHaveBeenCalledWith({
        data: { ...baseInput, status: 'FAILED', retryCount: 3 },
      });
      expect(result.retryCount).toBe(3);
    });

    it('finds the SUCCESS lookup and the FAILED/SKIPPED lookup scoped to the same (localEntityUuid, entityType)', async () => {
      findFirst.mockResolvedValueOnce(null);
      findFirst.mockResolvedValueOnce(null);
      create.mockResolvedValue({
        id: 'item-1',
        localEntityUuid: 'local-uuid-1',
        entityType: 'BENEFICIARY',
        status: 'SUCCESS',
        retryCount: 0,
      });

      await repository.create(baseInput);

      expect(findFirst).toHaveBeenNthCalledWith(1, {
        where: {
          localEntityUuid: 'local-uuid-1',
          entityType: 'BENEFICIARY',
          status: 'SUCCESS',
          isDeleted: false,
        },
        select: { id: true },
      });
      expect(findFirst).toHaveBeenNthCalledWith(2, {
        where: {
          localEntityUuid: 'local-uuid-1',
          entityType: 'BENEFICIARY',
          status: { in: ['FAILED', 'SKIPPED'] },
          isDeleted: false,
        },
        orderBy: { createdAt: 'desc' },
        select: { retryCount: true },
      });
    });
  });

  describe('findBatchOwner', () => {
    it("returns the batch's userId when found", async () => {
      findFirstBatch.mockResolvedValue({ userId: 'user-1' });
      const result = await repository.findBatchOwner('batch-1');
      expect(result).toBe('user-1');
    });

    it('returns null when the batch does not exist', async () => {
      findFirstBatch.mockResolvedValue(null);
      const result = await repository.findBatchOwner('batch-missing');
      expect(result).toBeNull();
    });
  });
});
