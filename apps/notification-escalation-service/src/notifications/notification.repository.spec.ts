import { NotificationRepository } from './notification.repository';

/**
 * `findMany` is the one method covered here for now — added specifically to
 * regression-test the recipient-scoping fix: a service-level mock can't
 * verify the actual Prisma `where` clause sent to the database.
 */
describe('NotificationRepository — findMany', () => {
  const findMany = jest.fn();
  const prisma = { notification: { findMany } } as never;
  let repository: NotificationRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new NotificationRepository(prisma);
  });

  it('scopes the query to the given recipientUserId and excludes soft-deleted rows', async () => {
    findMany.mockResolvedValue([]);

    await repository.findMany('sakhi-1');

    expect(findMany).toHaveBeenCalledWith({
      where: { recipientUserId: 'sakhi-1', isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  });
});
