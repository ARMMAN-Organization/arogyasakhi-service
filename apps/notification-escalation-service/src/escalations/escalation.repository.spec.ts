import { EscalationRepository } from './escalation.repository';
import type { ListEscalationEventsInput } from './dto/list-escalation-events.dto';

describe('EscalationRepository', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const create = jest.fn();
  const updateMany = jest.fn();
  const prisma = {
    escalationEvent: { findMany, findFirst, create, updateMany },
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
});
