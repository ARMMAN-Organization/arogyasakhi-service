import { RegistrationTargetRepository } from './registration-target.repository';

describe('RegistrationTargetRepository', () => {
  const findMany = jest.fn();
  const prisma = { sakhiRegistrationTarget: { findMany } } as never;
  let repository: RegistrationTargetRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new RegistrationTargetRepository(prisma);
  });

  describe('findBySakhiId', () => {
    it('queries target rows for the given Sakhi, excluding soft-deleted, ordered by period start', async () => {
      findMany.mockResolvedValue([
        { id: 'target-1', sakhiId: 'sakhi-1', targetPeriodStart: new Date('2026-04-01') },
      ]);

      const result = await repository.findBySakhiId('sakhi-1');

      expect(findMany).toHaveBeenCalledWith({
        where: { sakhiId: 'sakhi-1', isDeleted: false },
        orderBy: { targetPeriodStart: 'asc' },
      });
      expect(result).toEqual([
        { id: 'target-1', sakhiId: 'sakhi-1', targetPeriodStart: new Date('2026-04-01') },
      ]);
    });

    it('returns an empty array when the Sakhi has no targets', async () => {
      findMany.mockResolvedValue([]);
      const result = await repository.findBySakhiId('sakhi-with-no-targets');
      expect(result).toEqual([]);
    });
  });
});
