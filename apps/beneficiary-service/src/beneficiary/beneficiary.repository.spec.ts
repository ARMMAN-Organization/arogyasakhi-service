import { BeneficiaryRepository } from './beneficiary.repository';

describe('BeneficiaryRepository', () => {
  const groupBy = jest.fn();
  const findMany = jest.fn();
  const prisma = { beneficiaryCase: { groupBy, findMany } } as never;
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

  describe('updatePhase', () => {
    function buildTxMock(caseUpdateCount: number) {
      const beneficiaryCaseUpdateMany = jest.fn().mockResolvedValue({ count: caseUpdateCount });
      const childCaseDetailsUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const tx = {
        beneficiaryCase: { updateMany: beneficiaryCaseUpdateMany },
        childCaseDetails: { updateMany: childCaseDetailsUpdateMany },
      };
      const $transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(tx));
      return { $transaction, beneficiaryCaseUpdateMany, childCaseDetailsUpdateMany };
    }

    it('also advances ChildCaseDetails.currentPhase for a CHILD case, in the same transaction', async () => {
      const { $transaction, beneficiaryCaseUpdateMany, childCaseDetailsUpdateMany } =
        buildTxMock(1);
      const txRepository = new BeneficiaryRepository({ $transaction } as never);

      const result = await txRepository.updatePhase('ben-1', 'CHILD', 'NN', 'INC');

      expect(result).toBe(true);
      expect(beneficiaryCaseUpdateMany).toHaveBeenCalledWith({
        where: { id: 'ben-1', isDeleted: false, currentPhase: 'NN' },
        data: { currentPhase: 'INC' },
      });
      expect(childCaseDetailsUpdateMany).toHaveBeenCalledWith({
        where: { beneficiaryId: 'ben-1' },
        data: { currentPhase: 'INC' },
      });
    });

    it('does not touch ChildCaseDetails for a MOTHER case', async () => {
      const { $transaction, childCaseDetailsUpdateMany } = buildTxMock(1);
      const txRepository = new BeneficiaryRepository({ $transaction } as never);

      const result = await txRepository.updatePhase('ben-1', 'MOTHER', 'ANC', 'PP');

      expect(result).toBe(true);
      expect(childCaseDetailsUpdateMany).not.toHaveBeenCalled();
    });

    it('skips the ChildCaseDetails write when the case-level update raced to 0 rows', async () => {
      const { $transaction, childCaseDetailsUpdateMany } = buildTxMock(0);
      const txRepository = new BeneficiaryRepository({ $transaction } as never);

      const result = await txRepository.updatePhase('ben-1', 'CHILD', 'NN', 'INC');

      expect(result).toBe(false);
      expect(childCaseDetailsUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe('upsertRiskConditionSummary', () => {
    const BENEFICIARY_ID = 'ben-1';
    const RISK_CONDITION_ID = 'cond-1';
    const baseData = {
      riskConditionId: RISK_CONDITION_ID,
      phase: 'ANC',
      grade: 'HIGH',
      gradeRank: 3,
      observedValueJson: null,
      visitId: null,
      submissionId: null,
      assessedAt: new Date('2026-01-01'),
      isReferralTrigger: true,
      isHrVisitTrigger: false,
      ruleVersionId: null,
      isFirstInstance: true,
      consecutiveNoImprovementCount: null,
    };

    function buildPrismaMock(existing: unknown) {
      const findUnique = jest.fn().mockResolvedValue(existing);
      const upsert = jest.fn().mockResolvedValue({ id: 'summary-1' });
      const prismaMock = {
        beneficiaryRiskConditionSummary: { findUnique, upsert },
      } as never;
      return { prismaMock, findUnique, upsert };
    }

    it('persists isFirstInstance/consecutiveNoImprovementCount on the create branch (no existing row)', async () => {
      const { prismaMock, upsert } = buildPrismaMock(null);
      const txRepository = new BeneficiaryRepository(prismaMock);

      await txRepository.upsertRiskConditionSummary(BENEFICIARY_ID, {
        ...baseData,
        isFirstInstance: true,
        consecutiveNoImprovementCount: null,
      });

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            isFirstInstance: true,
            consecutiveNoImprovementCount: null,
          }),
        }),
      );
    });

    it('always overwrites isFirstInstance/consecutiveNoImprovementCount on the update branch, unconditionally', async () => {
      const { prismaMock, upsert } = buildPrismaMock({
        everHighestGradeRank: 5,
        everAtRiskFlag: true,
      });
      const txRepository = new BeneficiaryRepository(prismaMock);

      await txRepository.upsertRiskConditionSummary(BENEFICIARY_ID, {
        ...baseData,
        gradeRank: 1, // lower than existing everHighestGradeRank(5) -> everHighest fields not overwritten
        isFirstInstance: false,
        consecutiveNoImprovementCount: 2,
      });

      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: expect.objectContaining({
            isFirstInstance: false,
            consecutiveNoImprovementCount: 2,
          }),
        }),
      );
      // everHighestGrade fields must NOT appear in the update payload since
      // gradeRank(1) does not outrank the existing everHighestGradeRank(5) —
      // proves isFirstInstance/consecutiveNoImprovementCount are always-latest,
      // independent of the everHighest "only move toward more severe" gate.
      const updateArg = upsert.mock.calls[0][0].update;
      expect(updateArg.everHighestGrade).toBeUndefined();
    });
  });

  describe('findRiskConditionSummariesByBeneficiaryIds', () => {
    function buildPrismaMock(cases: unknown[], summaries: unknown[]) {
      const findMany = jest.fn().mockResolvedValueOnce(cases).mockResolvedValueOnce(summaries);
      const prismaMock = {
        beneficiaryCase: { findMany },
        beneficiaryRiskConditionSummary: { findMany },
      } as never;
      return { prismaMock, findMany };
    }

    it('returns an empty array immediately for an empty beneficiaryIds input, without querying', async () => {
      const findMany = jest.fn();
      const repository = new BeneficiaryRepository({
        beneficiaryCase: { findMany },
        beneficiaryRiskConditionSummary: { findMany },
      } as never);

      const result = await repository.findRiskConditionSummariesByBeneficiaryIds([], {});

      expect(result).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });

    it('intersects beneficiaryIds with sakhiId scoping in the WHERE clause (SAKHI own-roster)', async () => {
      const { prismaMock, findMany } = buildPrismaMock([{ id: 'ben-1' }], []);
      const repository = new BeneficiaryRepository(prismaMock);

      await repository.findRiskConditionSummariesByBeneficiaryIds(['ben-1', 'ben-2'], {
        sakhiId: 'sakhi-1',
      });

      expect(findMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: { in: ['ben-1', 'ben-2'] },
          isDeleted: false,
          sakhiId: 'sakhi-1',
        },
        select: { id: true },
      });
    });

    it('intersects beneficiaryIds with sakhiIds roster scoping (SUPERVISOR)', async () => {
      const { prismaMock, findMany } = buildPrismaMock([{ id: 'ben-1' }], []);
      const repository = new BeneficiaryRepository(prismaMock);

      await repository.findRiskConditionSummariesByBeneficiaryIds(['ben-1'], {
        sakhiIds: ['sakhi-1', 'sakhi-2'],
      });

      expect(findMany).toHaveBeenNthCalledWith(1, {
        where: {
          id: { in: ['ben-1'] },
          isDeleted: false,
          sakhiId: { in: ['sakhi-1', 'sakhi-2'] },
        },
        select: { id: true },
      });
    });

    it('returns an empty array when no case matches the scoped ids (out-of-scope id silently dropped)', async () => {
      const { prismaMock, findMany } = buildPrismaMock([], []);
      const repository = new BeneficiaryRepository(prismaMock);

      const result = await repository.findRiskConditionSummariesByBeneficiaryIds(
        ['out-of-scope-id'],
        { sakhiId: 'sakhi-1' },
      );

      expect(result).toEqual([]);
      // Only the first findMany (beneficiaryCase) ran — no point querying
      // BeneficiaryRiskConditionSummary for zero matched cases.
      expect(findMany).toHaveBeenCalledTimes(1);
    });

    it('includes a beneficiary with zero summary rows, with an empty riskConditionSummaries array', async () => {
      const { prismaMock } = buildPrismaMock(
        [{ id: 'ben-1' }, { id: 'ben-2' }],
        [{ beneficiaryId: 'ben-1', riskConditionId: 'cond-1' }],
      );
      const repository = new BeneficiaryRepository(prismaMock);

      const result = await repository.findRiskConditionSummariesByBeneficiaryIds(
        ['ben-1', 'ben-2'],
        {},
      );

      expect(result).toEqual([
        {
          beneficiaryId: 'ben-1',
          riskConditionSummaries: [{ beneficiaryId: 'ben-1', riskConditionId: 'cond-1' }],
        },
        { beneficiaryId: 'ben-2', riskConditionSummaries: [] },
      ]);
    });

    it('groups multiple summary rows under the same beneficiary', async () => {
      const { prismaMock } = buildPrismaMock(
        [{ id: 'ben-1' }],
        [
          { beneficiaryId: 'ben-1', riskConditionId: 'cond-1' },
          { beneficiaryId: 'ben-1', riskConditionId: 'cond-2' },
        ],
      );
      const repository = new BeneficiaryRepository(prismaMock);

      const result = await repository.findRiskConditionSummariesByBeneficiaryIds(['ben-1'], {});

      expect(result).toEqual([
        {
          beneficiaryId: 'ben-1',
          riskConditionSummaries: [
            { beneficiaryId: 'ben-1', riskConditionId: 'cond-1' },
            { beneficiaryId: 'ben-1', riskConditionId: 'cond-2' },
          ],
        },
      ]);
    });
  });

  describe('findOwnershipById', () => {
    it('selects only id/sakhiId/caseType, not the full enriched projection', async () => {
      const findFirst = jest
        .fn()
        .mockResolvedValue({ id: 'ben-1', sakhiId: 'sakhi-1', caseType: 'MOTHER' });
      const txRepository = new BeneficiaryRepository({
        beneficiaryCase: { findFirst },
      } as never);

      const result = await txRepository.findOwnershipById('ben-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'ben-1', isDeleted: false },
        select: { id: true, sakhiId: true, caseType: true },
      });
      expect(result).toEqual({ id: 'ben-1', sakhiId: 'sakhi-1', caseType: 'MOTHER' });
    });
  });

  describe('findMotherIdsWithEddOnOrBefore', () => {
    it('queries MOTHER/ACTIVE/ANC-phase beneficiaries with eddDate <= cutoffDate', async () => {
      findMany.mockResolvedValue([]);
      const cutoffDate = new Date('2026-08-01T00:00:00.000Z');

      await repository.findMotherIdsWithEddOnOrBefore(cutoffDate, 200, undefined);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          caseType: 'MOTHER',
          currentStatus: 'ACTIVE',
          currentPhase: 'ANC',
          motherCaseDetails: { eddDate: { lte: cutoffDate } },
        },
        orderBy: [{ motherCaseDetails: { eddDate: 'asc' } }, { id: 'asc' }],
        take: 201,
        select: {
          id: true,
          registrationDate: true,
          motherCaseDetails: { select: { eddDate: true } },
        },
      });
    });

    it('maps rows to {beneficiaryId, registrationDate, eddDate} and reports no next page under the limit', async () => {
      findMany.mockResolvedValue([
        {
          id: 'ben-1',
          registrationDate: new Date('2026-01-01T00:00:00.000Z'),
          motherCaseDetails: { eddDate: new Date('2026-07-01T00:00:00.000Z') },
        },
      ]);

      const result = await repository.findMotherIdsWithEddOnOrBefore(
        new Date('2026-08-01T00:00:00.000Z'),
        200,
        undefined,
      );

      expect(result.items).toEqual([
        {
          beneficiaryId: 'ben-1',
          registrationDate: new Date('2026-01-01T00:00:00.000Z'),
          eddDate: new Date('2026-07-01T00:00:00.000Z'),
        },
      ]);
      expect(result.nextCursor).toBeNull();
    });

    it('returns a nextCursor and trims the extra row when more results exist beyond the limit', async () => {
      const row = (n: number) => ({
        id: `ben-${n}`,
        registrationDate: new Date('2026-01-01T00:00:00.000Z'),
        motherCaseDetails: { eddDate: new Date(`2026-07-0${n}T00:00:00.000Z`) },
      });
      findMany.mockResolvedValue([row(1), row(2)]);

      const result = await repository.findMotherIdsWithEddOnOrBefore(
        new Date('2026-08-01T00:00:00.000Z'),
        1,
        undefined,
      );

      expect(result.items).toHaveLength(1);
      expect(result.items[0].beneficiaryId).toBe('ben-1');
      expect(result.nextCursor).not.toBeNull();
    });

    it('decodes a supplied cursor into an eddDate/id keyset filter', async () => {
      findMany.mockResolvedValue([]);
      const cursor = Buffer.from(
        JSON.stringify({ eddDate: '2026-07-05T00:00:00.000Z', id: 'ben-5' }),
      ).toString('base64url');

      await repository.findMotherIdsWithEddOnOrBefore(
        new Date('2026-08-01T00:00:00.000Z'),
        200,
        cursor,
      );

      const call = findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { motherCaseDetails: { eddDate: { lt: new Date('2026-07-05T00:00:00.000Z') } } },
        {
          motherCaseDetails: { eddDate: new Date('2026-07-05T00:00:00.000Z') },
          id: { gt: 'ben-5' },
        },
      ]);
    });

    it('treats a malformed cursor as "start from the beginning" rather than throwing', async () => {
      findMany.mockResolvedValue([]);

      await expect(
        repository.findMotherIdsWithEddOnOrBefore(
          new Date('2026-08-01T00:00:00.000Z'),
          200,
          'not-a-valid-cursor',
        ),
      ).resolves.toEqual({ items: [], nextCursor: null });

      expect(findMany.mock.calls[0][0].where.OR).toBeUndefined();
    });
  });
});
