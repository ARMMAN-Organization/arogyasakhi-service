import { ReferralRepository } from './referral.repository';

describe('ReferralRepository', () => {
  const referralFindMany = jest.fn();
  const followupGroupBy = jest.fn();
  const followupFindMany = jest.fn();
  const prisma = {
    referral: { findMany: referralFindMany },
    referralFollowup: { groupBy: followupGroupBy, findMany: followupFindMany },
  } as never;
  let repository: ReferralRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ReferralRepository(prisma);
  });

  describe('findManyWithFollowupSummary', () => {
    it('queries referrals with a single IN(...) filter, scoped to non-deleted rows', async () => {
      referralFindMany.mockResolvedValue([]);

      await repository.findManyWithFollowupSummary(['ref-1', 'ref-2']);

      expect(referralFindMany).toHaveBeenCalledWith({
        where: { id: { in: ['ref-1', 'ref-2'] }, isDeleted: false },
      });
    });

    it('returns an empty array without querying follow-ups when no referral matches', async () => {
      referralFindMany.mockResolvedValue([]);

      const result = await repository.findManyWithFollowupSummary(['unknown-id']);

      expect(result).toEqual([]);
      expect(followupGroupBy).not.toHaveBeenCalled();
      expect(followupFindMany).not.toHaveBeenCalled();
    });

    it('merges each referral with its incompleteCount and latestFollowup in one batched pair of queries', async () => {
      const referralOne = { id: 'ref-1', beneficiaryId: 'ben-1' };
      const referralTwo = { id: 'ref-2', beneficiaryId: 'ben-2' };
      referralFindMany.mockResolvedValue([referralOne, referralTwo]);
      followupGroupBy.mockResolvedValue([{ referralId: 'ref-1', _count: { _all: 3 } }]);
      followupFindMany.mockResolvedValue([
        {
          referralId: 'ref-1',
          followupDate: new Date('2026-07-15'),
          notVisitedReason: 'Beneficiary unavailable',
          outcome: null,
        },
      ]);

      const result = await repository.findManyWithFollowupSummary(['ref-1', 'ref-2']);

      expect(followupGroupBy).toHaveBeenCalledWith({
        by: ['referralId'],
        where: {
          referralId: { in: ['ref-1', 'ref-2'] },
          isDeleted: false,
          followupStatus: 'INCOMPLETE',
        },
        _count: { _all: true },
      });
      expect(followupFindMany).toHaveBeenCalledWith({
        where: { referralId: { in: ['ref-1', 'ref-2'] }, isDeleted: false },
        orderBy: [{ referralId: 'asc' }, { followupDate: 'desc' }],
        distinct: ['referralId'],
        select: { referralId: true, followupDate: true, notVisitedReason: true, outcome: true },
      });
      expect(result).toEqual([
        {
          ...referralOne,
          incompleteCount: 3,
          latestFollowup: {
            followupDate: new Date('2026-07-15'),
            notVisitedReason: 'Beneficiary unavailable',
            outcome: null,
          },
        },
        { ...referralTwo, incompleteCount: 0, latestFollowup: null },
      ]);
    });
  });
});
