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

/**
 * `transactionType`/`transactionDate` describe a whole group's event, not
 * just one row, so a change to either on `updateInventoryTransaction` must
 * propagate to every sibling row in the group — a service-level mock of
 * `repository.updateInventoryTransaction` can't verify this, since the
 * propagation is the repository method's own internal behavior.
 */
describe('OperationsRepository — updateInventoryTransaction group-wide propagation', () => {
  const findFirst = jest.fn();
  const update = jest.fn();
  const updateMany = jest.fn();
  const $transaction = jest.fn();
  const prisma = {
    inventoryTransaction: { findFirst, update, updateMany },
    $transaction,
  } as never;
  let repository: OperationsRepository;

  const existingRow = {
    id: 'row-1',
    groupId: 'group-1',
    quantity: 1,
    transactionType: 'HANDOVER',
    transactionDate: new Date('2026-09-01'),
    remarks: null,
    isDeleted: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new OperationsRepository(prisma);
    findFirst.mockResolvedValue(existingRow);
  });

  it('updates only the target row, with no group-wide propagation, when only quantity/remarks change', async () => {
    const updatedRow = { ...existingRow, quantity: 5 };
    update.mockResolvedValue(updatedRow);

    const result = await repository.updateInventoryTransaction(
      'row-1',
      { quantity: 5 },
      'caller-1',
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: { quantity: 5, updatedByUserId: 'caller-1' },
    });
    expect(updateMany).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
    expect(result).toBe(updatedRow);
  });

  it('propagates a transactionType change to every other non-deleted row in the group, atomically', async () => {
    const updatedRow = { ...existingRow, transactionType: 'CONSUMED' };
    const updateOp = Symbol('updateOp');
    const updateManyOp = Symbol('updateManyOp');
    update.mockReturnValue(updateOp);
    updateMany.mockReturnValue(updateManyOp);
    $transaction.mockResolvedValue([{ count: 1 }, updatedRow]);

    const result = await repository.updateInventoryTransaction(
      'row-1',
      { transactionType: 'CONSUMED' },
      'caller-1',
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', id: { not: 'row-1' }, isDeleted: false },
      data: { transactionType: 'CONSUMED', updatedByUserId: 'caller-1' },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: { transactionType: 'CONSUMED', updatedByUserId: 'caller-1' },
    });
    expect($transaction).toHaveBeenCalledWith([updateManyOp, updateOp]);
    expect(result).toBe(updatedRow);
  });

  it('propagates a transactionDate change to the group the same way', async () => {
    const newDate = new Date('2026-09-05');
    const updatedRow = { ...existingRow, transactionDate: newDate };
    $transaction.mockResolvedValue([{ count: 1 }, updatedRow]);

    await repository.updateInventoryTransaction('row-1', { transactionDate: newDate }, 'caller-1');

    expect(updateMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', id: { not: 'row-1' }, isDeleted: false },
      data: { transactionDate: newDate, updatedByUserId: 'caller-1' },
    });
  });

  it('propagates only transactionType/transactionDate to siblings, never quantity/remarks, when both kinds of field change together', async () => {
    const updatedRow = { ...existingRow, transactionType: 'RETURNED', quantity: 9 };
    $transaction.mockResolvedValue([{ count: 1 }, updatedRow]);

    await repository.updateInventoryTransaction(
      'row-1',
      { transactionType: 'RETURNED', quantity: 9, remarks: 'corrected' },
      'caller-1',
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: { groupId: 'group-1', id: { not: 'row-1' }, isDeleted: false },
      data: { transactionType: 'RETURNED', updatedByUserId: 'caller-1' },
    });
    expect(update).toHaveBeenCalledWith({
      where: { id: 'row-1' },
      data: {
        quantity: 9,
        remarks: 'corrected',
        transactionType: 'RETURNED',
        updatedByUserId: 'caller-1',
      },
    });
  });

  it('returns null without writing anything when the transaction does not exist', async () => {
    findFirst.mockResolvedValue(null);

    const result = await repository.updateInventoryTransaction(
      'missing',
      { transactionType: 'CONSUMED' },
      'caller-1',
    );

    expect(result).toBeNull();
    expect(update).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect($transaction).not.toHaveBeenCalled();
  });
});
