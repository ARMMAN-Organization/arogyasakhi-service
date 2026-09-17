import { VisitScheduleRepository } from './visitSchedule.repository';

describe('VisitScheduleRepository', () => {
  const findMany = jest.fn();
  const prisma = { visitSchedule: { findMany } } as never;
  let repository: VisitScheduleRepository;

  const row = (n: number, createdAt: string) => ({
    id: `schedule-${n}`,
    createdAt: new Date(createdAt),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new VisitScheduleRepository(prisma);
  });

  describe('findManyPaginated', () => {
    it('returns an empty page without querying the DB when beneficiaryIds is empty', async () => {
      const result = await repository.findManyPaginated({ beneficiaryIds: [], limit: 50 });

      expect(result).toEqual({ items: [], nextCursor: null });
      expect(findMany).not.toHaveBeenCalled();
    });

    it('filters by beneficiaryId: { in: [...] } and excludes soft-deleted rows', async () => {
      findMany.mockResolvedValue([]);

      await repository.findManyPaginated({ beneficiaryIds: ['b-1', 'b-2'], limit: 50 });

      expect(findMany.mock.calls[0][0].where).toEqual({
        isDeleted: false,
        beneficiaryId: { in: ['b-1', 'b-2'] },
      });
    });

    it('returns nextCursor: null when fewer than limit+1 rows exist', async () => {
      findMany.mockResolvedValue([row(1, '2026-08-01T00:00:00.000Z')]);

      const result = await repository.findManyPaginated({ beneficiaryIds: ['b-1'], limit: 50 });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('returns a nextCursor and trims the extra row when more results exist beyond the limit', async () => {
      findMany.mockResolvedValue([
        row(1, '2026-08-03T00:00:00.000Z'),
        row(2, '2026-08-02T00:00:00.000Z'),
      ]);

      const result = await repository.findManyPaginated({ beneficiaryIds: ['b-1'], limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('schedule-1');
      expect(result.nextCursor).not.toBeNull();
    });

    it('decodes a supplied cursor into a createdAt/id keyset filter', async () => {
      findMany.mockResolvedValue([]);
      const cursor = Buffer.from(
        JSON.stringify({ createdAt: '2026-08-05T00:00:00.000Z', id: 'schedule-5' }),
      ).toString('base64url');

      await repository.findManyPaginated({ beneficiaryIds: ['b-1'], limit: 50, cursor });

      const call = findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { createdAt: { lt: new Date('2026-08-05T00:00:00.000Z') } },
        { createdAt: new Date('2026-08-05T00:00:00.000Z'), id: { lt: 'schedule-5' } },
      ]);
    });

    it('treats a malformed cursor as "start from the beginning" rather than throwing', async () => {
      findMany.mockResolvedValue([]);

      await expect(
        repository.findManyPaginated({ beneficiaryIds: ['b-1'], limit: 50, cursor: 'not-valid' }),
      ).resolves.toEqual({ items: [], nextCursor: null });

      expect(findMany.mock.calls[0][0].where.OR).toBeUndefined();
    });
  });
});
