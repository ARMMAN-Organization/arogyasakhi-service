import { QuickResponseRepository } from './quick-response.repository';

describe('QuickResponseRepository', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const updateMany = jest.fn();
  const prisma = { approvalRequest: { findMany, findFirst, updateMany } } as never;
  let repository: QuickResponseRepository;

  const STATUS_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new QuickResponseRepository(prisma);
  });

  describe('findMany', () => {
    it('includes a requestedByUserId IN filter when sakhiIds is a non-null array', async () => {
      findMany.mockResolvedValue([]);

      await repository.findMany(STATUS_ID, 50, null, ['sakhi-1', 'sakhi-2']);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          decisionStatusLookupId: STATUS_ID,
          isDeleted: false,
          requestedByUserId: { in: ['sakhi-1', 'sakhi-2'] },
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 51,
      });
    });

    it('omits the requestedByUserId filter entirely when sakhiIds is null (privileged caller)', async () => {
      findMany.mockResolvedValue([]);

      await repository.findMany(STATUS_ID, 50, null, null);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          decisionStatusLookupId: STATUS_ID,
          isDeleted: false,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 51,
      });
    });

    it('scopes to an empty result set when sakhiIds is an empty array (zero assigned Sakhis)', async () => {
      findMany.mockResolvedValue([]);

      await repository.findMany(STATUS_ID, 50, null, []);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ requestedByUserId: { in: [] } }),
        }),
      );
    });

    it('still applies the cursor OR clause alongside the sakhiIds filter', async () => {
      findMany.mockResolvedValue([]);
      const cursor = { createdAt: new Date('2026-08-05T10:00:00.000Z'), id: 'card-1' };

      await repository.findMany(STATUS_ID, 50, cursor, ['sakhi-1']);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          decisionStatusLookupId: STATUS_ID,
          isDeleted: false,
          requestedByUserId: { in: ['sakhi-1'] },
          OR: [
            { createdAt: { lt: cursor.createdAt } },
            { createdAt: cursor.createdAt, id: { lt: cursor.id } },
          ],
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 51,
      });
    });
  });

  describe('findManyByIds', () => {
    it('queries by an id IN filter, excluding soft-deleted rows, with no pagination', async () => {
      findMany.mockResolvedValue([]);

      await repository.findManyByIds(['card-1', 'card-2']);

      expect(findMany).toHaveBeenCalledWith({
        where: { id: { in: ['card-1', 'card-2'] }, isDeleted: false },
      });
    });
  });
});
