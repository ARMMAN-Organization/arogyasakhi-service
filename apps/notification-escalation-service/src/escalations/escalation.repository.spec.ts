import { EscalationRepository } from './escalation.repository';
import type { ListEscalationEventsInput } from './dto/list-escalation-events.dto';
import type { CreateEscalationEventInput } from './dto/create-escalation-event.dto';

describe('EscalationRepository', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const updateMany = jest.fn();
  const executeRaw = jest.fn();
  const txClient = {
    escalationEvent: { findFirst, create, update },
    $executeRaw: executeRaw,
  };
  const prisma = {
    escalationEvent: { findMany, findFirst, create, updateMany },
    $transaction: jest.fn((fn: (tx: typeof txClient) => unknown) => fn(txClient)),
  } as never;
  let repository: EscalationRepository;

  const baseQuery: ListEscalationEventsInput = { status: 'OPEN', limit: 50 };

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new EscalationRepository(prisma);
  });

  describe('findMany', () => {
    it('includes assignedSupervisorId in the where clause when provided', async () => {
      findMany.mockResolvedValue([]);

      await repository.findMany(baseQuery, null, 'supervisor-1');

      expect(findMany).toHaveBeenCalledWith({
        where: {
          status: 'OPEN',
          isDeleted: false,
          assignedSupervisorId: 'supervisor-1',
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 51,
      });
    });

    it('omits assignedSupervisorId from the where clause when not provided', async () => {
      findMany.mockResolvedValue([]);

      await repository.findMany(baseQuery, null);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          status: 'OPEN',
          isDeleted: false,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 51,
      });
    });

    it('still applies the cursor OR clause alongside the assignedSupervisorId filter', async () => {
      findMany.mockResolvedValue([]);
      const cursor = { createdAt: new Date('2026-08-05T10:00:00.000Z'), id: 'event-1' };

      await repository.findMany(baseQuery, cursor, 'supervisor-1');

      expect(findMany).toHaveBeenCalledWith({
        where: {
          status: 'OPEN',
          isDeleted: false,
          assignedSupervisorId: 'supervisor-1',
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

  describe('createOrReuseOpen', () => {
    const baseInput: CreateEscalationEventInput = {
      beneficiaryId: 'beneficiary-1',
      escalationType: 'ANC_2_MISSED',
      assignedSupervisorId: 'supervisor-1',
    };

    it('takes an advisory lock keyed on the natural key before checking for a duplicate', async () => {
      findFirst.mockResolvedValue(null);
      create.mockResolvedValue({ id: 'new-row' });

      await repository.createOrReuseOpen(baseInput, 'admin-user-id');

      expect(executeRaw).toHaveBeenCalled();
    });

    it('inserts a new row when no OPEN duplicate exists', async () => {
      findFirst.mockResolvedValue(null);
      const created = { id: 'new-row' };
      create.mockResolvedValue(created);

      const result = await repository.createOrReuseOpen(baseInput, 'admin-user-id');

      expect(result).toEqual({ event: created, wasCreated: true });
      expect(create).toHaveBeenCalledWith({
        data: {
          beneficiaryId: 'beneficiary-1',
          sakhiUserId: null,
          escalationType: 'ANC_2_MISSED',
          visitId: null,
          referralId: null,
          visitsMissedCount: null,
          assignedSupervisorId: 'supervisor-1',
          status: 'OPEN',
          createdByUserId: 'admin-user-id',
        },
      });
    });

    it('returns the existing OPEN row unchanged when its assignedSupervisorId already matches', async () => {
      const existing = { id: 'existing-row', assignedSupervisorId: 'supervisor-1' };
      findFirst.mockResolvedValue(existing);

      const result = await repository.createOrReuseOpen(baseInput, 'admin-user-id');

      expect(result).toEqual({ event: existing, wasCreated: false });
      expect(create).not.toHaveBeenCalled();
      expect(update).not.toHaveBeenCalled();
    });

    it('self-heals assignedSupervisorId on the existing row when it has changed', async () => {
      const existing = { id: 'existing-row', assignedSupervisorId: 'old-supervisor' };
      findFirst.mockResolvedValue(existing);
      const updated = { ...existing, assignedSupervisorId: 'supervisor-1' };
      update.mockResolvedValue(updated);

      const result = await repository.createOrReuseOpen(baseInput, 'admin-user-id');

      expect(result).toEqual({ event: updated, wasCreated: false });
      expect(update).toHaveBeenCalledWith({
        where: { id: 'existing-row' },
        data: { assignedSupervisorId: 'supervisor-1' },
      });
      expect(create).not.toHaveBeenCalled();
    });

    it('only narrows the duplicate match by fields actually present on the input', async () => {
      findFirst.mockResolvedValue(null);
      create.mockResolvedValue({ id: 'new-row' });

      await repository.createOrReuseOpen(
        {
          sakhiUserId: 'sakhi-1',
          escalationType: 'SYNC_DELAY',
          assignedSupervisorId: 'supervisor-1',
        },
        'system-account-id',
      );

      expect(findFirst).toHaveBeenCalledWith({
        where: {
          status: 'OPEN',
          isDeleted: false,
          escalationType: 'SYNC_DELAY',
          sakhiUserId: 'sakhi-1',
        },
      });
    });
  });
});
