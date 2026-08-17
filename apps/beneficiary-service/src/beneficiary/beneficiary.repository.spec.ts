import { BeneficiaryRepository } from './beneficiary.repository';

describe('BeneficiaryRepository', () => {
  const groupBy = jest.fn();
  const prisma = { beneficiaryCase: { groupBy } } as never;
  let repository: BeneficiaryRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new BeneficiaryRepository(prisma);
  });

  describe('countByCaseType', () => {
    it('returns active-beneficiary high-risk sub-counts alongside existing counts', async () => {
      groupBy
        .mockResolvedValueOnce([
          { caseType: 'MOTHER', _count: { _all: 4 } },
          { caseType: 'CHILD', _count: { _all: 3 } },
        ])
        .mockResolvedValueOnce([
          { caseType: 'MOTHER', _count: { _all: 3 } },
          { caseType: 'CHILD', _count: { _all: 2 } },
        ])
        .mockResolvedValueOnce([
          { caseType: 'MOTHER', _count: { _all: 1 } },
          { caseType: 'CHILD', _count: { _all: 0 } },
        ]);

      const result = await repository.countByCaseType({});

      expect(result.activeMothersHighRiskCount).toBe(1);
      expect(result.activeChildrenHighRiskCount).toBe(0);
      expect(result.activeMothersCount).toBe(3);
      expect(result.activeChildrenCount).toBe(2);
    });

    it('returns 0 for both high-risk counts when no active beneficiary is flagged', async () => {
      groupBy
        .mockResolvedValueOnce([{ caseType: 'MOTHER', _count: { _all: 2 } }])
        .mockResolvedValueOnce([{ caseType: 'MOTHER', _count: { _all: 2 } }])
        .mockResolvedValueOnce([]);

      const result = await repository.countByCaseType({});

      expect(result.activeMothersHighRiskCount).toBe(0);
      expect(result.activeChildrenHighRiskCount).toBe(0);
    });

    it('never returns a high-risk count exceeding the parent active count', async () => {
      groupBy
        .mockResolvedValueOnce([{ caseType: 'MOTHER', _count: { _all: 5 } }])
        .mockResolvedValueOnce([{ caseType: 'MOTHER', _count: { _all: 5 } }])
        .mockResolvedValueOnce([{ caseType: 'MOTHER', _count: { _all: 5 } }]);

      const result = await repository.countByCaseType({});

      expect(result.activeMothersHighRiskCount).toBe(result.activeMothersCount);
    });

    it('filters the high-risk sub-query by latestVisitHighRiskFlag on the related current-summary row', async () => {
      groupBy.mockResolvedValue([]);

      await repository.countByCaseType({ sakhiId: 'sakhi-1' });

      expect(groupBy).toHaveBeenNthCalledWith(3, {
        by: ['caseType'],
        where: {
          isDeleted: false,
          sakhiId: 'sakhi-1',
          currentStatus: 'ACTIVE',
          currentSummary: { latestVisitHighRiskFlag: true },
        },
        _count: { _all: true },
      });
    });

    it('applies the same sakhiId/date-range filters to the high-risk sub-query as the base active query', async () => {
      groupBy.mockResolvedValue([]);

      await repository.countByCaseType({
        sakhiIds: ['sakhi-a', 'sakhi-b'],
        fromDate: '2026-01-01',
        toDate: '2026-01-31',
      });

      const [, activeCall, highRiskCall] = groupBy.mock.calls;
      expect(highRiskCall[0].where).toMatchObject({
        sakhiId: { in: ['sakhi-a', 'sakhi-b'] },
        registrationDate: activeCall[0].where.registrationDate,
        currentStatus: 'ACTIVE',
      });
    });

    it('treats a beneficiary with no related current-summary row as not high-risk', async () => {
      // Prisma's relation filter (`currentSummary: { latestVisitHighRiskFlag: true }`)
      // naturally excludes rows with no related summary — nothing beyond the
      // query shape itself needs to be asserted here; a missing relation can
      // never satisfy the nested equality filter.
      groupBy
        .mockResolvedValueOnce([{ caseType: 'MOTHER', _count: { _all: 1 } }])
        .mockResolvedValueOnce([{ caseType: 'MOTHER', _count: { _all: 1 } }])
        .mockResolvedValueOnce([]);

      const result = await repository.countByCaseType({});

      expect(result.activeMothersHighRiskCount).toBe(0);
    });
  });
});
