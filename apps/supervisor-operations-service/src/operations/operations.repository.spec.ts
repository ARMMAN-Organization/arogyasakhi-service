import { OperationsRepository } from './operations.repository';

/**
 * `createEventPhoto` is the one method covered here for now — added
 * specifically to regression-test the PR #165 review's race-condition fix,
 * which a service-level mock (operations.service.meeting-training.spec.ts)
 * can't verify: the "first photo wins" invariant now lives entirely in the
 * conditional `WHERE photoMediaId IS NULL` sent to the database, not in any
 * application-level boolean.
 */
describe('OperationsRepository — createEventPhoto', () => {
  const create = jest.fn();
  const updateMany = jest.fn();
  const $transaction = jest.fn();
  const prisma = {
    eventPhoto: { create },
    supervisorEvent: { updateMany },
    $transaction,
  } as never;
  let repository: OperationsRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new OperationsRepository(prisma);
  });

  it('creates the gallery row and conditionally updates photoMediaId in one transaction', async () => {
    const photoRow = {
      id: 'photo-1',
      eventId: 'event-1',
      mediaId: 'media-1',
      createdAt: new Date(),
    };
    const createOp = Symbol('createOp');
    const updateManyOp = Symbol('updateManyOp');
    create.mockReturnValue(createOp);
    updateMany.mockReturnValue(updateManyOp);
    $transaction.mockResolvedValue([photoRow, { count: 1 }]);

    const result = await repository.createEventPhoto('event-1', 'media-1', 'caller-1');

    expect(create).toHaveBeenCalledWith({
      data: { eventId: 'event-1', mediaId: 'media-1', createdByUserId: 'caller-1' },
    });
    // The "does this event already have a completion photo" check is the
    // WHERE clause itself, sent to the DB inside the same transaction as the
    // gallery write — not a boolean decided by a read beforehand. This is
    // what makes concurrent calls safe: row-level locking on this UPDATE
    // serializes them, so only the first to commit ever changes a row.
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'event-1', photoMediaId: null },
      data: { photoMediaId: 'media-1', updatedByUserId: 'caller-1' },
    });
    expect($transaction).toHaveBeenCalledWith([createOp, updateManyOp]);
    expect(result).toBe(photoRow);
  });

  it('returns the created photo row even when the event already had a completion photo (updateMany affects 0 rows)', async () => {
    const photoRow = {
      id: 'photo-2',
      eventId: 'event-1',
      mediaId: 'media-2',
      createdAt: new Date(),
    };
    $transaction.mockResolvedValue([photoRow, { count: 0 }]);

    const result = await repository.createEventPhoto('event-1', 'media-2', 'caller-1');

    expect(result).toBe(photoRow);
  });
});
