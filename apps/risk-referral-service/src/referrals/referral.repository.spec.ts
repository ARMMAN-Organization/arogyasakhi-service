import { ReferralRepository } from './referral.repository';

/**
 * `findMany` is the one method covered here for now — added specifically to
 * regression-test the beneficiary-scoping addition: a service-level mock
 * can't verify the actual Prisma `where` clause sent to the database.
 */
describe('ReferralRepository — findMany', () => {
  const findMany = jest.fn();
  const prisma = { referral: { findMany } } as never;
  let repository: ReferralRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ReferralRepository(prisma);
  });

  it('with no beneficiaryId, keeps the existing unfiltered most-recent-50 behavior', async () => {
    findMany.mockResolvedValue([]);

    await repository.findMany();

    expect(findMany).toHaveBeenCalledWith({
      where: undefined,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });

  it('with a beneficiaryId, scopes the query to that beneficiary only', async () => {
    findMany.mockResolvedValue([]);

    await repository.findMany('22222222-2222-2222-2222-222222222222');

    expect(findMany).toHaveBeenCalledWith({
      where: { beneficiaryId: '22222222-2222-2222-2222-222222222222' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });
});
