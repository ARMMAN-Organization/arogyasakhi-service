import { badGateway } from '@armman/service-commons';
import { OperationsService } from './operations.service';
import type { OperationsRepository } from './operations.repository';
import type { SakhiClient } from './sakhi.client';
import type { CreateSupervisorEventInput } from './dto/create-supervisorEvent.dto';
import type {
  SupervisorEvent,
  EventAttendance,
  InventoryItem,
  InventoryTransaction,
  CallLog,
} from '../../../../node_modules/.prisma/client-supervisor-operations-service';

describe('OperationsService', () => {
  const repository = {
    findEvents: jest.fn(),
    createEvent: jest.fn(),
    findConflictingEvent: jest.fn(),
    findEventById: jest.fn(),
    updateEventStatus: jest.fn(),
    findAttendanceByEvent: jest.fn(),
    upsertAttendance: jest.fn(),
    findInventoryItems: jest.fn(),
    createInventoryItem: jest.fn(),
    findInventoryTransactions: jest.fn(),
    findInventoryTransactionsBySakhi: jest.fn(),
    findInventoryItemById: jest.fn(),
    findInventoryTransactionById: jest.fn(),
    createInventoryTransactions: jest.fn(),
    updateInventoryTransaction: jest.fn(),
    softDeleteInventoryTransaction: jest.fn(),
    findCallLogs: jest.fn(),
    createCallLog: jest.fn(),
    findCallLogById: jest.fn(),
    findCallLogsBySakhi: jest.fn(),
    findRecentCallLogsBySakhi: jest.fn(),
    updateCallLog: jest.fn(),
    countPendingFollowups: jest.fn(),
  } as unknown as jest.Mocked<OperationsRepository>;
  const sakhiClient = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<SakhiClient>;
  let service: OperationsService;

  const supervisorCaller = {
    id: '33333333-3333-3333-3333-333333333333',
    roles: ['SUPERVISOR'],
  };
  const otherSupervisorCaller = { id: 'other-supervisor', roles: ['SUPERVISOR'] };
  const managerCaller = { id: 'manager-1', roles: ['MANAGER'] };
  const adminCaller = { id: 'admin-1', roles: ['ADMIN'] };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new OperationsService(repository, sakhiClient);
  });

  const eventRow: SupervisorEvent = {
    id: '11111111-1111-1111-1111-111111111111',
    projectId: '22222222-2222-2222-2222-222222222222',
    supervisorId: '33333333-3333-3333-3333-333333333333',
    eventType: 'TRAINING',
    eventDate: new Date('2026-07-01'),
    topicsJson: ['anemia', 'nutrition'],
    remarks: null,
    status: 'SCHEDULED',
    photoMediaId: null,
    createdAt: new Date(),
    createdByUserId: null,
    updatedAt: new Date(),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
  };

  it('lists events via repository', async () => {
    repository.findEvents.mockResolvedValue([eventRow]);
    await service.listEvents();
    expect(repository.findEvents).toHaveBeenCalledTimes(1);
  });

  it('returns the events list unchanged', async () => {
    const rows = [eventRow];
    repository.findEvents.mockResolvedValue(rows);
    await expect(service.listEvents()).resolves.toBe(rows);
  });

  it('creates an event via repository with the given data', async () => {
    const dto: CreateSupervisorEventInput = {
      projectId: '22222222-2222-2222-2222-222222222222',
      supervisorId: '33333333-3333-3333-3333-333333333333',
      eventType: 'MEETING',
      eventDate: new Date('2026-07-01'),
      topicsJson: ['review'],
      status: 'SCHEDULED',
    };
    repository.createEvent.mockResolvedValue(eventRow);
    await expect(service.createEvent(dto)).resolves.toBe(eventRow);
    expect(repository.createEvent).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on createEvent', async () => {
    repository.createEvent.mockRejectedValue(new Error('db down'));
    await expect(
      service.createEvent({
        projectId: '22222222-2222-2222-2222-222222222222',
        supervisorId: '33333333-3333-3333-3333-333333333333',
        eventType: 'MEETING',
        eventDate: new Date('2026-07-01'),
        topicsJson: ['review'],
        status: 'SCHEDULED',
      }),
    ).rejects.toThrow('db down');
  });

  it('rejects a COMPLETED event with no photoMediaId without hitting the repository', async () => {
    await expect(
      service.createEvent({
        projectId: '22222222-2222-2222-2222-222222222222',
        supervisorId: '33333333-3333-3333-3333-333333333333',
        eventType: 'MEETING',
        eventDate: new Date('2026-07-01'),
        topicsJson: ['review'],
        status: 'COMPLETED',
      }),
    ).rejects.toThrow('photoMediaId is required when status is COMPLETED.');
    expect(repository.createEvent).not.toHaveBeenCalled();
  });

  it('allows a COMPLETED event when photoMediaId is present', async () => {
    const dto: CreateSupervisorEventInput = {
      projectId: '22222222-2222-2222-2222-222222222222',
      supervisorId: '33333333-3333-3333-3333-333333333333',
      eventType: 'MEETING',
      eventDate: new Date('2026-07-01'),
      topicsJson: ['review'],
      status: 'COMPLETED',
      photoMediaId: '55555555-5555-5555-5555-555555555555',
    };
    repository.createEvent.mockResolvedValue(eventRow);
    await expect(service.createEvent(dto)).resolves.toBe(eventRow);
    expect(repository.createEvent).toHaveBeenCalledWith(dto);
  });

  it('rejects a duplicate event for the same supervisor/project/eventDate, without creating anything', async () => {
    const dto: CreateSupervisorEventInput = {
      projectId: '22222222-2222-2222-2222-222222222222',
      supervisorId: '33333333-3333-3333-3333-333333333333',
      eventType: 'MEETING',
      eventDate: new Date('2026-07-01T10:00:00Z'),
      topicsJson: ['review'],
      status: 'SCHEDULED',
    };
    repository.findConflictingEvent.mockResolvedValue(eventRow);

    await expect(service.createEvent(dto)).rejects.toMatchObject({ status: 409 });
    expect(repository.findConflictingEvent).toHaveBeenCalledWith(
      dto.supervisorId,
      dto.projectId,
      dto.eventDate,
    );
    expect(repository.createEvent).not.toHaveBeenCalled();
  });

  it('allows creating an event when no conflicting event exists', async () => {
    const dto: CreateSupervisorEventInput = {
      projectId: '22222222-2222-2222-2222-222222222222',
      supervisorId: '33333333-3333-3333-3333-333333333333',
      eventType: 'MEETING',
      eventDate: new Date('2026-07-01T10:00:00Z'),
      topicsJson: ['review'],
      status: 'SCHEDULED',
    };
    repository.findConflictingEvent.mockResolvedValue(null);
    repository.createEvent.mockResolvedValue(eventRow);

    await expect(service.createEvent(dto)).resolves.toBe(eventRow);
    expect(repository.createEvent).toHaveBeenCalledWith(dto);
  });

  it('lists events with filters via repository', async () => {
    repository.findEvents.mockResolvedValue([eventRow]);
    await service.listEvents({ status: 'SCHEDULED', eventType: 'TRAINING' });
    expect(repository.findEvents).toHaveBeenCalledWith({
      status: 'SCHEDULED',
      eventType: 'TRAINING',
    });
  });

  describe('getEvent', () => {
    it('returns the event when it exists and is owned by the caller', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      await expect(service.getEvent(eventRow.id, supervisorCaller)).resolves.toBe(eventRow);
    });

    it('throws 404 when the event does not exist', async () => {
      repository.findEventById.mockResolvedValue(null);
      await expect(service.getEvent('missing', supervisorCaller)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('rejects a Supervisor who does not own the event', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      await expect(service.getEvent(eventRow.id, otherSupervisorCaller)).rejects.toMatchObject({
        status: 403,
      });
    });

    it('allows MANAGER to fetch any event', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      await expect(service.getEvent(eventRow.id, managerCaller)).resolves.toBe(eventRow);
    });

    it('allows ADMIN to fetch any event', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      await expect(service.getEvent(eventRow.id, adminCaller)).resolves.toBe(eventRow);
    });
  });

  describe('cancelEvent', () => {
    const cancelledRow: SupervisorEvent = { ...eventRow, status: 'CANCELLED' };

    it('cancels a SCHEDULED event owned by the caller', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      repository.updateEventStatus.mockResolvedValue(cancelledRow);

      const result = await service.cancelEvent(eventRow.id, supervisorCaller);

      expect(repository.updateEventStatus).toHaveBeenCalledWith(
        eventRow.id,
        'CANCELLED',
        supervisorCaller.id,
      );
      expect(result).toBe(cancelledRow);
    });

    it('throws 404 when the event does not exist', async () => {
      repository.findEventById.mockResolvedValue(null);
      await expect(service.cancelEvent('missing', supervisorCaller)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('rejects a Supervisor who does not own the event, without updating anything', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      await expect(service.cancelEvent(eventRow.id, otherSupervisorCaller)).rejects.toMatchObject({
        status: 403,
      });
      expect(repository.updateEventStatus).not.toHaveBeenCalled();
    });

    it('throws 409 when the event is already COMPLETED', async () => {
      repository.findEventById.mockResolvedValue({ ...eventRow, status: 'COMPLETED' });
      await expect(service.cancelEvent(eventRow.id, supervisorCaller)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.updateEventStatus).not.toHaveBeenCalled();
    });

    it('throws 409 when the event is already CANCELLED', async () => {
      repository.findEventById.mockResolvedValue(cancelledRow);
      await expect(service.cancelEvent(eventRow.id, supervisorCaller)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.updateEventStatus).not.toHaveBeenCalled();
    });

    it('allows an ADMIN to cancel an event they do not own', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      repository.updateEventStatus.mockResolvedValue(cancelledRow);
      await expect(service.cancelEvent(eventRow.id, adminCaller)).resolves.toBe(cancelledRow);
    });

    it('allows a MANAGER to cancel an event they do not own', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      repository.updateEventStatus.mockResolvedValue(cancelledRow);
      await expect(service.cancelEvent(eventRow.id, managerCaller)).resolves.toBe(cancelledRow);
    });
  });

  describe('completeEvent', () => {
    const eventWithPhoto: SupervisorEvent = {
      ...eventRow,
      photoMediaId: '55555555-5555-5555-5555-555555555555',
    };
    const completedRow: SupervisorEvent = { ...eventWithPhoto, status: 'COMPLETED' };
    const attendanceRow: EventAttendance = {
      id: '66666666-6666-6666-6666-666666666666',
      eventId: eventRow.id,
      sakhiId: '44444444-4444-4444-4444-444444444444',
      attendanceStatus: 'PRESENT',
      preTrainingScore: null,
      postTrainingScore: null,
      remarks: null,
      createdAt: new Date(),
      createdByUserId: null,
      updatedAt: new Date(),
      updatedByUserId: null,
      isDeleted: false,
      deletedAt: null,
    };

    it('completes a SCHEDULED event with a photo and existing attendance', async () => {
      repository.findEventById.mockResolvedValue(eventWithPhoto);
      repository.findAttendanceByEvent.mockResolvedValue([attendanceRow]);
      repository.updateEventStatus.mockResolvedValue(completedRow);

      const result = await service.completeEvent(eventRow.id, supervisorCaller);

      expect(repository.updateEventStatus).toHaveBeenCalledWith(
        eventRow.id,
        'COMPLETED',
        supervisorCaller.id,
      );
      expect(result).toBe(completedRow);
    });

    it('throws 422 when photoMediaId is missing', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      await expect(service.completeEvent(eventRow.id, supervisorCaller)).rejects.toMatchObject({
        status: 422,
      });
      expect(repository.updateEventStatus).not.toHaveBeenCalled();
    });

    it('throws 422 when no attendance rows exist for the event', async () => {
      repository.findEventById.mockResolvedValue(eventWithPhoto);
      repository.findAttendanceByEvent.mockResolvedValue([]);
      await expect(service.completeEvent(eventRow.id, supervisorCaller)).rejects.toMatchObject({
        status: 422,
      });
      expect(repository.updateEventStatus).not.toHaveBeenCalled();
    });

    it('throws 404 when the event does not exist', async () => {
      repository.findEventById.mockResolvedValue(null);
      await expect(service.completeEvent('missing', supervisorCaller)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('rejects a Supervisor who does not own the event, without completing it', async () => {
      repository.findEventById.mockResolvedValue(eventWithPhoto);
      await expect(service.completeEvent(eventRow.id, otherSupervisorCaller)).rejects.toMatchObject(
        { status: 403 },
      );
      expect(repository.updateEventStatus).not.toHaveBeenCalled();
    });

    it('throws 409 when the event is already COMPLETED', async () => {
      repository.findEventById.mockResolvedValue(completedRow);
      await expect(service.completeEvent(eventRow.id, supervisorCaller)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.updateEventStatus).not.toHaveBeenCalled();
    });

    it('throws 409 when the event is already CANCELLED', async () => {
      repository.findEventById.mockResolvedValue({ ...eventWithPhoto, status: 'CANCELLED' });
      await expect(service.completeEvent(eventRow.id, supervisorCaller)).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.updateEventStatus).not.toHaveBeenCalled();
    });

    it('allows an ADMIN to complete an event they do not own', async () => {
      repository.findEventById.mockResolvedValue(eventWithPhoto);
      repository.findAttendanceByEvent.mockResolvedValue([attendanceRow]);
      repository.updateEventStatus.mockResolvedValue(completedRow);
      await expect(service.completeEvent(eventRow.id, adminCaller)).resolves.toBe(completedRow);
    });

    it('allows a MANAGER to complete an event they do not own', async () => {
      repository.findEventById.mockResolvedValue(eventWithPhoto);
      repository.findAttendanceByEvent.mockResolvedValue([attendanceRow]);
      repository.updateEventStatus.mockResolvedValue(completedRow);
      await expect(service.completeEvent(eventRow.id, managerCaller)).resolves.toBe(completedRow);
    });
  });

  describe('getEventAttendance', () => {
    const attendanceRow: EventAttendance = {
      id: '66666666-6666-6666-6666-666666666666',
      eventId: eventRow.id,
      sakhiId: '44444444-4444-4444-4444-444444444444',
      attendanceStatus: 'PRESENT',
      preTrainingScore: null,
      postTrainingScore: null,
      remarks: null,
      createdAt: new Date(),
      createdByUserId: null,
      updatedAt: new Date(),
      updatedByUserId: null,
      isDeleted: false,
      deletedAt: null,
    };

    it('returns attendance rows for an event owned by the caller', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      repository.findAttendanceByEvent.mockResolvedValue([attendanceRow]);
      await expect(service.getEventAttendance(eventRow.id, supervisorCaller)).resolves.toEqual([
        attendanceRow,
      ]);
    });

    it('throws 404 when the event does not exist', async () => {
      repository.findEventById.mockResolvedValue(null);
      await expect(service.getEventAttendance('missing', supervisorCaller)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('rejects a Supervisor who does not own the event', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      await expect(
        service.getEventAttendance(eventRow.id, otherSupervisorCaller),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('returns an empty array when the event has no attendance yet', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      repository.findAttendanceByEvent.mockResolvedValue([]);
      await expect(service.getEventAttendance(eventRow.id, supervisorCaller)).resolves.toEqual([]);
    });

    it('allows a MANAGER to view attendance for an event they do not own', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      repository.findAttendanceByEvent.mockResolvedValue([attendanceRow]);
      await expect(service.getEventAttendance(eventRow.id, managerCaller)).resolves.toEqual([
        attendanceRow,
      ]);
    });

    it('allows an ADMIN to view attendance for an event they do not own', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      repository.findAttendanceByEvent.mockResolvedValue([attendanceRow]);
      await expect(service.getEventAttendance(eventRow.id, adminCaller)).resolves.toEqual([
        attendanceRow,
      ]);
    });
  });

  describe('updateEventAttendance', () => {
    const attendanceRow: EventAttendance = {
      id: '66666666-6666-6666-6666-666666666666',
      eventId: eventRow.id,
      sakhiId: '44444444-4444-4444-4444-444444444444',
      attendanceStatus: 'PRESENT',
      preTrainingScore: null,
      postTrainingScore: null,
      remarks: null,
      createdAt: new Date(),
      createdByUserId: null,
      updatedAt: new Date(),
      updatedByUserId: null,
      isDeleted: false,
      deletedAt: null,
    };
    const dto = {
      attendance: [
        { sakhiId: '44444444-4444-4444-4444-444444444444', attendanceStatus: 'PRESENT' as const },
      ],
    };

    it('upserts attendance via repository for an event owned by the caller', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      repository.upsertAttendance.mockResolvedValue([attendanceRow]);

      const result = await service.updateEventAttendance(eventRow.id, dto, supervisorCaller);

      expect(repository.upsertAttendance).toHaveBeenCalledWith(
        eventRow.id,
        dto.attendance,
        supervisorCaller.id,
      );
      expect(result).toEqual([attendanceRow]);
    });

    it('throws 404 when the event does not exist', async () => {
      repository.findEventById.mockResolvedValue(null);
      await expect(
        service.updateEventAttendance('missing', dto, supervisorCaller),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.upsertAttendance).not.toHaveBeenCalled();
    });

    it('rejects a Supervisor who does not own the event, without writing anything', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      await expect(
        service.updateEventAttendance(eventRow.id, dto, otherSupervisorCaller),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.upsertAttendance).not.toHaveBeenCalled();
    });

    it('allows an ADMIN to write attendance for an event they do not own', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      repository.upsertAttendance.mockResolvedValue([attendanceRow]);
      await expect(service.updateEventAttendance(eventRow.id, dto, adminCaller)).resolves.toEqual([
        attendanceRow,
      ]);
    });

    it('allows a MANAGER to write attendance for an event they do not own', async () => {
      repository.findEventById.mockResolvedValue(eventRow);
      repository.upsertAttendance.mockResolvedValue([attendanceRow]);
      await expect(service.updateEventAttendance(eventRow.id, dto, managerCaller)).resolves.toEqual(
        [attendanceRow],
      );
    });

    it('writes multiple attendance rows for a multi-Sakhi submission', async () => {
      const multiDto = {
        attendance: [
          { sakhiId: '44444444-4444-4444-4444-444444444444', attendanceStatus: 'PRESENT' as const },
          { sakhiId: '55555555-5555-5555-5555-555555555555', attendanceStatus: 'ABSENT' as const },
        ],
      };
      repository.findEventById.mockResolvedValue(eventRow);
      repository.upsertAttendance.mockResolvedValue([attendanceRow, attendanceRow]);

      await service.updateEventAttendance(eventRow.id, multiDto, supervisorCaller);

      expect(repository.upsertAttendance).toHaveBeenCalledWith(
        eventRow.id,
        multiDto.attendance,
        supervisorCaller.id,
      );
    });
  });

  it('lists inventory items via repository', async () => {
    const rows: InventoryItem[] = [
      {
        id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        itemCode: 'BP-01',
        itemName: 'BP Monitor',
        itemCategory: 'INSTRUMENT',
        unit: 'unit',
        status: 'ACTIVE',
        createdAt: new Date(),
        createdByUserId: null,
        updatedAt: new Date(),
        updatedByUserId: null,
        isDeleted: false,
        deletedAt: null,
      },
    ];
    repository.findInventoryItems.mockResolvedValue(rows);
    await expect(service.listInventoryItems()).resolves.toBe(rows);
  });

  describe('createInventoryItem', () => {
    const dto = {
      itemCode: 'BP-01',
      itemName: 'BP Monitor',
      itemCategory: 'INSTRUMENT' as const,
      unit: 'unit',
      status: 'ACTIVE' as const,
    };
    const createdRow: InventoryItem = {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      itemCode: 'BP-01',
      itemName: 'BP Monitor',
      itemCategory: 'INSTRUMENT',
      unit: 'unit',
      status: 'ACTIVE',
      createdAt: new Date(),
      createdByUserId: 'admin-1',
      updatedAt: new Date(),
      updatedByUserId: 'admin-1',
      isDeleted: false,
      deletedAt: null,
    };

    it('creates an item via repository with the given data', async () => {
      repository.createInventoryItem.mockResolvedValue(createdRow);
      await expect(service.createInventoryItem(dto, 'admin-1')).resolves.toBe(createdRow);
      expect(repository.createInventoryItem).toHaveBeenCalledWith(dto, 'admin-1');
    });

    it('maps a unique-constraint violation (duplicate itemCode) to 409', async () => {
      repository.createInventoryItem.mockRejectedValue({ code: 'P2002' });
      await expect(service.createInventoryItem(dto, 'admin-1')).rejects.toMatchObject({
        status: 409,
      });
    });

    it('propagates other repository errors unchanged', async () => {
      repository.createInventoryItem.mockRejectedValue(new Error('db down'));
      await expect(service.createInventoryItem(dto, 'admin-1')).rejects.toThrow('db down');
    });
  });

  it('lists inventory transactions via repository', async () => {
    const rows: InventoryTransaction[] = [
      {
        id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        projectId: '22222222-2222-2222-2222-222222222222',
        supervisorId: '33333333-3333-3333-3333-333333333333',
        sakhiId: '44444444-4444-4444-4444-444444444444',
        itemId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        transactionType: 'HANDOVER',
        quantity: 1,
        transactionDate: new Date('2026-07-01'),
        remarks: null,
        createdAt: new Date(),
        createdByUserId: null,
        updatedAt: new Date(),
        updatedByUserId: null,
        isDeleted: false,
        deletedAt: null,
      },
    ];
    repository.findInventoryTransactions.mockResolvedValue(rows);
    await expect(service.listInventoryTransactions()).resolves.toBe(rows);
  });

  const inventoryTransactionRow: InventoryTransaction = {
    id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    projectId: '22222222-2222-2222-2222-222222222222',
    supervisorId: '33333333-3333-3333-3333-333333333333',
    sakhiId: '44444444-4444-4444-4444-444444444444',
    itemId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    transactionType: 'HANDOVER',
    quantity: 1,
    transactionDate: new Date('2026-07-01'),
    remarks: null,
    createdAt: new Date(),
    createdByUserId: null,
    updatedAt: new Date(),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
  };

  const activeItem: InventoryItem = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    itemCode: 'BP-01',
    itemName: 'BP Monitor',
    itemCategory: 'INSTRUMENT',
    unit: 'unit',
    status: 'ACTIVE',
    createdAt: new Date(),
    createdByUserId: null,
    updatedAt: new Date(),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
  };

  describe('listInventoryTransactionsBySakhi', () => {
    const sakhi = {
      sakhiId: '44444444-4444-4444-4444-444444444444',
      supervisorId: supervisorCaller.id,
      primaryProjectId: '22222222-2222-2222-2222-222222222222',
    };

    it('lists a Sakhi’s transactions via repository when the caller is her assigned Supervisor', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.findInventoryTransactionsBySakhi.mockResolvedValue([inventoryTransactionRow]);

      await expect(
        service.listInventoryTransactionsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          supervisorCaller,
          'Bearer token',
        ),
      ).resolves.toEqual([inventoryTransactionRow]);
      expect(repository.findInventoryTransactionsBySakhi).toHaveBeenCalledWith(
        '44444444-4444-4444-4444-444444444444',
      );
    });

    it('returns an empty array (not an error) when the Sakhi has no transactions', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.findInventoryTransactionsBySakhi.mockResolvedValue([]);
      await expect(
        service.listInventoryTransactionsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          supervisorCaller,
          'Bearer token',
        ),
      ).resolves.toEqual([]);
    });

    it('rejects a Supervisor who is not this Sakhi’s assigned Supervisor', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      await expect(
        service.listInventoryTransactionsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          otherSupervisorCaller,
          'Bearer token',
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findInventoryTransactionsBySakhi).not.toHaveBeenCalled();
    });

    it('throws 404 when the Sakhi does not exist', async () => {
      sakhiClient.findById.mockResolvedValue(null);
      await expect(
        service.listInventoryTransactionsBySakhi('missing', supervisorCaller, 'Bearer token'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('allows a MANAGER regardless of Sakhi assignment, without calling the Sakhi client', async () => {
      repository.findInventoryTransactionsBySakhi.mockResolvedValue([inventoryTransactionRow]);
      await expect(
        service.listInventoryTransactionsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          managerCaller,
          'Bearer token',
        ),
      ).resolves.toEqual([inventoryTransactionRow]);
      expect(sakhiClient.findById).not.toHaveBeenCalled();
    });

    it('allows an ADMIN regardless of Sakhi assignment, without calling the Sakhi client', async () => {
      repository.findInventoryTransactionsBySakhi.mockResolvedValue([inventoryTransactionRow]);
      await expect(
        service.listInventoryTransactionsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          adminCaller,
          'Bearer token',
        ),
      ).resolves.toEqual([inventoryTransactionRow]);
      expect(sakhiClient.findById).not.toHaveBeenCalled();
    });
  });

  describe('createInventoryTransactions', () => {
    const baseDto = {
      projectId: '22222222-2222-2222-2222-222222222222',
      sakhiId: '44444444-4444-4444-4444-444444444444',
      transactionType: 'HANDOVER' as const,
      transactionDate: new Date('2026-07-01'),
      items: [{ itemId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', quantity: 2 }],
    };

    const sakhi = {
      sakhiId: '44444444-4444-4444-4444-444444444444',
      supervisorId: supervisorCaller.id,
      primaryProjectId: '22222222-2222-2222-2222-222222222222',
    };

    it('creates one row per item, using the caller’s own id as supervisorId (never client-supplied)', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.findInventoryItemById.mockResolvedValue(activeItem);
      repository.createInventoryTransactions.mockResolvedValue([inventoryTransactionRow]);

      const result = await service.createInventoryTransactions(
        baseDto,
        supervisorCaller,
        'Bearer token',
      );

      expect(repository.findInventoryItemById).toHaveBeenCalledWith(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      );
      expect(repository.createInventoryTransactions).toHaveBeenCalledWith(
        [
          {
            projectId: baseDto.projectId,
            supervisorId: supervisorCaller.id,
            sakhiId: baseDto.sakhiId,
            transactionType: baseDto.transactionType,
            transactionDate: baseDto.transactionDate,
            itemId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
            quantity: 2,
          },
        ],
        supervisorCaller.id,
      );
      expect(result).toEqual([inventoryTransactionRow]);
    });

    it('rejects a Supervisor posting for a Sakhi assigned to another Supervisor, without creating anything', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);

      await expect(
        service.createInventoryTransactions(baseDto, otherSupervisorCaller, 'Bearer token'),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findInventoryItemById).not.toHaveBeenCalled();
      expect(repository.createInventoryTransactions).not.toHaveBeenCalled();
    });

    it('rejects when the Sakhi does not exist, without creating anything', async () => {
      sakhiClient.findById.mockResolvedValue(null);

      await expect(
        service.createInventoryTransactions(baseDto, supervisorCaller, 'Bearer token'),
      ).rejects.toMatchObject({ status: 422 });
      expect(repository.createInventoryTransactions).not.toHaveBeenCalled();
    });

    it('allows a MANAGER regardless of Sakhi assignment, without calling the Sakhi client', async () => {
      repository.findInventoryItemById.mockResolvedValue(activeItem);
      repository.createInventoryTransactions.mockResolvedValue([inventoryTransactionRow]);

      await service.createInventoryTransactions(baseDto, managerCaller, 'Bearer token');

      expect(sakhiClient.findById).not.toHaveBeenCalled();
      expect(repository.createInventoryTransactions).toHaveBeenCalled();
    });

    it('allows an ADMIN regardless of Sakhi assignment, stamping their own id as supervisorId', async () => {
      repository.findInventoryItemById.mockResolvedValue(activeItem);
      repository.createInventoryTransactions.mockResolvedValue([inventoryTransactionRow]);

      await service.createInventoryTransactions(baseDto, adminCaller, 'Bearer token');

      expect(sakhiClient.findById).not.toHaveBeenCalled();
      expect(repository.createInventoryTransactions).toHaveBeenCalledWith(
        expect.arrayContaining([expect.objectContaining({ supervisorId: adminCaller.id })]),
        adminCaller.id,
      );
    });

    it('rejects when a referenced item does not exist, without creating anything', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.findInventoryItemById.mockResolvedValue(null);

      await expect(
        service.createInventoryTransactions(baseDto, supervisorCaller, 'Bearer token'),
      ).rejects.toMatchObject({ status: 422 });
      expect(repository.createInventoryTransactions).not.toHaveBeenCalled();
    });

    it('rejects when a referenced item is inactive, without creating anything', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.findInventoryItemById.mockResolvedValue({ ...activeItem, status: 'INACTIVE' });

      await expect(
        service.createInventoryTransactions(baseDto, supervisorCaller, 'Bearer token'),
      ).rejects.toMatchObject({ status: 422 });
      expect(repository.createInventoryTransactions).not.toHaveBeenCalled();
    });

    it('creates multiple rows for a multi-item submission', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.findInventoryItemById.mockResolvedValue(activeItem);
      repository.createInventoryTransactions.mockResolvedValue([
        inventoryTransactionRow,
        inventoryTransactionRow,
      ]);

      const dto = {
        ...baseDto,
        items: [
          { itemId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', quantity: 2 },
          { itemId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', quantity: 5 },
        ],
      };

      await service.createInventoryTransactions(dto, supervisorCaller, 'Bearer token');

      expect(repository.createInventoryTransactions).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ quantity: 2, supervisorId: supervisorCaller.id }),
          expect.objectContaining({ quantity: 5, supervisorId: supervisorCaller.id }),
        ]),
        supervisorCaller.id,
      );
    });
  });

  describe('updateInventoryTransaction', () => {
    it('updates via repository and returns the updated row when the caller owns the transaction', async () => {
      repository.findInventoryTransactionById.mockResolvedValue(inventoryTransactionRow);
      repository.updateInventoryTransaction.mockResolvedValue(inventoryTransactionRow);

      const result = await service.updateInventoryTransaction(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        { quantity: 3 },
        supervisorCaller,
      );

      expect(repository.updateInventoryTransaction).toHaveBeenCalledWith(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        { quantity: 3 },
        supervisorCaller.id,
      );
      expect(result).toBe(inventoryTransactionRow);
    });

    it('throws 404 when the transaction does not exist', async () => {
      repository.findInventoryTransactionById.mockResolvedValue(null);
      await expect(
        service.updateInventoryTransaction('missing', { quantity: 3 }, supervisorCaller),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('rejects a Supervisor who does not own the transaction, without updating anything', async () => {
      repository.findInventoryTransactionById.mockResolvedValue(inventoryTransactionRow);
      await expect(
        service.updateInventoryTransaction(
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          { quantity: 3 },
          otherSupervisorCaller,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.updateInventoryTransaction).not.toHaveBeenCalled();
    });

    it('allows an ADMIN to update a transaction they do not own', async () => {
      repository.findInventoryTransactionById.mockResolvedValue(inventoryTransactionRow);
      repository.updateInventoryTransaction.mockResolvedValue(inventoryTransactionRow);

      const result = await service.updateInventoryTransaction(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        { quantity: 3 },
        adminCaller,
      );

      expect(repository.updateInventoryTransaction).toHaveBeenCalledWith(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        { quantity: 3 },
        adminCaller.id,
      );
      expect(result).toBe(inventoryTransactionRow);
    });
  });

  describe('deleteInventoryTransaction', () => {
    it('soft-deletes via repository when the caller owns the transaction', async () => {
      repository.findInventoryTransactionById.mockResolvedValue(inventoryTransactionRow);
      repository.softDeleteInventoryTransaction.mockResolvedValue(inventoryTransactionRow);
      await service.deleteInventoryTransaction(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        supervisorCaller,
      );
      expect(repository.softDeleteInventoryTransaction).toHaveBeenCalledWith(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        supervisorCaller.id,
      );
    });

    it('throws 404 when the transaction does not exist', async () => {
      repository.findInventoryTransactionById.mockResolvedValue(null);
      await expect(
        service.deleteInventoryTransaction('missing', supervisorCaller),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('rejects a Supervisor who does not own the transaction, without deleting anything', async () => {
      repository.findInventoryTransactionById.mockResolvedValue(inventoryTransactionRow);
      await expect(
        service.deleteInventoryTransaction(
          'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
          otherSupervisorCaller,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.softDeleteInventoryTransaction).not.toHaveBeenCalled();
    });

    it('allows an ADMIN to delete a transaction they do not own', async () => {
      repository.findInventoryTransactionById.mockResolvedValue(inventoryTransactionRow);
      repository.softDeleteInventoryTransaction.mockResolvedValue(inventoryTransactionRow);
      await service.deleteInventoryTransaction('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', adminCaller);
      expect(repository.softDeleteInventoryTransaction).toHaveBeenCalledWith(
        'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
        adminCaller.id,
      );
    });
  });

  it('lists call logs via repository', async () => {
    const rows: CallLog[] = [
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        projectId: '22222222-2222-2222-2222-222222222222',
        supervisorId: '33333333-3333-3333-3333-333333333333',
        sakhiId: '44444444-4444-4444-4444-444444444444',
        callDatetime: new Date('2026-07-01T10:00:00Z'),
        callStatus: 'PICKED_UP_TALKED',
        notes: null,
        followupAction: null,
        callStartAt: new Date('2026-07-01T10:00:00Z'),
        callEndAt: new Date('2026-07-01T10:05:00Z'),
        callDurationSeconds: 300,
        responder: null,
        createdAt: new Date(),
        createdByUserId: null,
        updatedAt: new Date(),
        updatedByUserId: null,
        isDeleted: false,
        deletedAt: null,
      },
    ];
    repository.findCallLogs.mockResolvedValue(rows);
    await expect(service.listCallLogs(supervisorCaller)).resolves.toBe(rows);
    expect(repository.findCallLogs).toHaveBeenCalledWith(supervisorCaller.id);
  });

  it('lists all call logs unscoped for a MANAGER', async () => {
    const rows: CallLog[] = [];
    repository.findCallLogs.mockResolvedValue(rows);
    await expect(service.listCallLogs(managerCaller)).resolves.toBe(rows);
    expect(repository.findCallLogs).toHaveBeenCalledWith(undefined);
  });

  const callLogRow: CallLog = {
    id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    projectId: '22222222-2222-2222-2222-222222222222',
    supervisorId: '33333333-3333-3333-3333-333333333333',
    sakhiId: '44444444-4444-4444-4444-444444444444',
    callDatetime: new Date('2026-07-01T10:00:00Z'),
    callStatus: 'PICKED_UP_TALKED',
    notes: null,
    followupAction: null,
    callStartAt: new Date('2026-07-01T10:00:00Z'),
    callEndAt: new Date('2026-07-01T10:05:00Z'),
    callDurationSeconds: 300,
    responder: null,
    createdAt: new Date(),
    createdByUserId: null,
    updatedAt: new Date(),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
  };

  const sakhi = {
    sakhiId: '44444444-4444-4444-4444-444444444444',
    supervisorId: supervisorCaller.id,
    primaryProjectId: '22222222-2222-2222-2222-222222222222',
  };

  describe('createCallLog', () => {
    const baseDto = {
      projectId: '22222222-2222-2222-2222-222222222222',
      sakhiId: '44444444-4444-4444-4444-444444444444',
      callDatetime: new Date('2026-07-01T10:00:00Z'),
      callStatus: 'PICKED_UP_TALKED' as const,
      callStartAt: new Date('2026-07-01T10:00:00Z'),
    };

    it('creates a call log via repository, using the caller’s own id as supervisorId', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.createCallLog.mockResolvedValue(callLogRow);

      const result = await service.createCallLog(baseDto, supervisorCaller, 'Bearer token');

      expect(repository.createCallLog).toHaveBeenCalledWith(
        { ...baseDto, supervisorId: supervisorCaller.id },
        supervisorCaller.id,
      );
      expect(result).toBe(callLogRow);
    });

    it('rejects a Supervisor logging a call for a Sakhi assigned to another Supervisor', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      await expect(
        service.createCallLog(baseDto, otherSupervisorCaller, 'Bearer token'),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.createCallLog).not.toHaveBeenCalled();
    });

    it('rejects when the Sakhi does not exist, without creating anything', async () => {
      sakhiClient.findById.mockResolvedValue(null);
      await expect(
        service.createCallLog(baseDto, supervisorCaller, 'Bearer token'),
      ).rejects.toMatchObject({ status: 422 });
      expect(repository.createCallLog).not.toHaveBeenCalled();
    });

    it('allows a MANAGER regardless of Sakhi assignment, without calling the Sakhi client', async () => {
      repository.createCallLog.mockResolvedValue(callLogRow);
      await service.createCallLog(baseDto, managerCaller, 'Bearer token');
      expect(sakhiClient.findById).not.toHaveBeenCalled();
      expect(repository.createCallLog).toHaveBeenCalledWith(
        { ...baseDto, supervisorId: managerCaller.id },
        managerCaller.id,
      );
    });

    it('allows an ADMIN regardless of Sakhi assignment, stamping their own id as supervisorId', async () => {
      repository.createCallLog.mockResolvedValue(callLogRow);
      await service.createCallLog(baseDto, adminCaller, 'Bearer token');
      expect(sakhiClient.findById).not.toHaveBeenCalled();
      expect(repository.createCallLog).toHaveBeenCalledWith(
        { ...baseDto, supervisorId: adminCaller.id },
        adminCaller.id,
      );
    });

    it('propagates repository errors on createCallLog', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.createCallLog.mockRejectedValue(new Error('db down'));
      await expect(
        service.createCallLog(baseDto, supervisorCaller, 'Bearer token'),
      ).rejects.toThrow('db down');
    });
  });

  describe('getCallLog', () => {
    it('returns the call log when the caller owns it', async () => {
      repository.findCallLogById.mockResolvedValue(callLogRow);
      await expect(
        service.getCallLog('cccccccc-cccc-cccc-cccc-cccccccccccc', supervisorCaller),
      ).resolves.toBe(callLogRow);
    });

    it('throws 404 when the call log does not exist', async () => {
      repository.findCallLogById.mockResolvedValue(null);
      await expect(service.getCallLog('missing', supervisorCaller)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('rejects a Supervisor who does not own the call log', async () => {
      repository.findCallLogById.mockResolvedValue(callLogRow);
      await expect(
        service.getCallLog('cccccccc-cccc-cccc-cccc-cccccccccccc', otherSupervisorCaller),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('allows a MANAGER to fetch a call log they do not own', async () => {
      repository.findCallLogById.mockResolvedValue(callLogRow);
      await expect(
        service.getCallLog('cccccccc-cccc-cccc-cccc-cccccccccccc', managerCaller),
      ).resolves.toBe(callLogRow);
    });

    it('allows an ADMIN to fetch a call log they do not own', async () => {
      repository.findCallLogById.mockResolvedValue(callLogRow);
      await expect(
        service.getCallLog('cccccccc-cccc-cccc-cccc-cccccccccccc', adminCaller),
      ).resolves.toBe(callLogRow);
    });
  });

  describe('updateCallLog', () => {
    it('updates via repository and returns the updated row when the caller owns the call log', async () => {
      repository.findCallLogById.mockResolvedValue(callLogRow);
      repository.updateCallLog.mockResolvedValue(callLogRow);

      const result = await service.updateCallLog(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        { callStatus: 'CALL_BACK' },
        supervisorCaller,
      );

      expect(repository.updateCallLog).toHaveBeenCalledWith(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        { callStatus: 'CALL_BACK' },
        supervisorCaller.id,
      );
      expect(result).toBe(callLogRow);
    });

    it('throws 404 when the call log does not exist', async () => {
      repository.findCallLogById.mockResolvedValue(null);
      await expect(
        service.updateCallLog('missing', { callStatus: 'RINGING' }, supervisorCaller),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('rejects a Supervisor who does not own the call log, without updating anything', async () => {
      repository.findCallLogById.mockResolvedValue(callLogRow);
      await expect(
        service.updateCallLog(
          'cccccccc-cccc-cccc-cccc-cccccccccccc',
          { callStatus: 'RINGING' },
          otherSupervisorCaller,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.updateCallLog).not.toHaveBeenCalled();
    });

    it('rejects a callEndAt earlier than the record’s own callStartAt, without updating anything', async () => {
      repository.findCallLogById.mockResolvedValue(callLogRow);
      await expect(
        service.updateCallLog(
          'cccccccc-cccc-cccc-cccc-cccccccccccc',
          { callEndAt: new Date(callLogRow.callStartAt.getTime() - 60 * 60 * 1000) },
          supervisorCaller,
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(repository.updateCallLog).not.toHaveBeenCalled();
    });

    it('accepts a callEndAt at or after the record’s own callStartAt', async () => {
      repository.findCallLogById.mockResolvedValue(callLogRow);
      repository.updateCallLog.mockResolvedValue(callLogRow);

      const callEndAt = new Date(callLogRow.callStartAt.getTime() + 60 * 1000);
      await service.updateCallLog(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        { callEndAt },
        supervisorCaller,
      );

      expect(repository.updateCallLog).toHaveBeenCalledWith(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        { callEndAt },
        supervisorCaller.id,
      );
    });

    it('allows an ADMIN to update a call log they do not own', async () => {
      repository.findCallLogById.mockResolvedValue(callLogRow);
      repository.updateCallLog.mockResolvedValue(callLogRow);

      const result = await service.updateCallLog(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        { callStatus: 'RINGING' },
        adminCaller,
      );

      expect(repository.updateCallLog).toHaveBeenCalledWith(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        { callStatus: 'RINGING' },
        adminCaller.id,
      );
      expect(result).toBe(callLogRow);
    });

    it('allows a MANAGER to update a call log they do not own', async () => {
      repository.findCallLogById.mockResolvedValue(callLogRow);
      repository.updateCallLog.mockResolvedValue(callLogRow);

      await service.updateCallLog(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        { callStatus: 'RINGING' },
        managerCaller,
      );

      expect(repository.updateCallLog).toHaveBeenCalledWith(
        'cccccccc-cccc-cccc-cccc-cccccccccccc',
        { callStatus: 'RINGING' },
        managerCaller.id,
      );
    });
  });

  describe('listCallLogsBySakhi', () => {
    it('lists a Sakhi’s call logs via repository when the caller is her assigned Supervisor', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.findCallLogsBySakhi.mockResolvedValue([callLogRow]);

      await expect(
        service.listCallLogsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          supervisorCaller,
          'Bearer token',
        ),
      ).resolves.toEqual([callLogRow]);
      expect(repository.findCallLogsBySakhi).toHaveBeenCalledWith(
        '44444444-4444-4444-4444-444444444444',
      );
    });

    it('rejects a Supervisor who is not this Sakhi’s assigned Supervisor', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      await expect(
        service.listCallLogsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          otherSupervisorCaller,
          'Bearer token',
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findCallLogsBySakhi).not.toHaveBeenCalled();
    });

    it('throws 404 when the Sakhi does not exist', async () => {
      sakhiClient.findById.mockResolvedValue(null);
      await expect(
        service.listCallLogsBySakhi('missing', supervisorCaller, 'Bearer token'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('returns an empty array (not an error) when the Sakhi has no call logs', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.findCallLogsBySakhi.mockResolvedValue([]);
      await expect(
        service.listCallLogsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          supervisorCaller,
          'Bearer token',
        ),
      ).resolves.toEqual([]);
    });

    it('allows a MANAGER regardless of Sakhi assignment, without calling the Sakhi client', async () => {
      repository.findCallLogsBySakhi.mockResolvedValue([callLogRow]);
      await expect(
        service.listCallLogsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          managerCaller,
          'Bearer token',
        ),
      ).resolves.toEqual([callLogRow]);
      expect(sakhiClient.findById).not.toHaveBeenCalled();
    });

    it('allows an ADMIN regardless of Sakhi assignment, without calling the Sakhi client', async () => {
      repository.findCallLogsBySakhi.mockResolvedValue([callLogRow]);
      await expect(
        service.listCallLogsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          adminCaller,
          'Bearer token',
        ),
      ).resolves.toEqual([callLogRow]);
      expect(sakhiClient.findById).not.toHaveBeenCalled();
    });
  });

  describe('listRecentCallLogsBySakhi', () => {
    it('lists recent call logs using the default window when the caller is her assigned Supervisor', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.findRecentCallLogsBySakhi.mockResolvedValue([callLogRow]);

      await expect(
        service.listRecentCallLogsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          supervisorCaller,
          'Bearer token',
        ),
      ).resolves.toEqual([callLogRow]);
      expect(repository.findRecentCallLogsBySakhi).toHaveBeenCalledWith(
        '44444444-4444-4444-4444-444444444444',
        expect.any(Date),
      );
    });

    it('respects a custom withinHours window', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.findRecentCallLogsBySakhi.mockResolvedValue([]);

      await service.listRecentCallLogsBySakhi(
        '44444444-4444-4444-4444-444444444444',
        supervisorCaller,
        'Bearer token',
        24,
      );

      const [, sinceDate] = repository.findRecentCallLogsBySakhi.mock.calls[0];
      const hoursAgo = (Date.now() - sinceDate.getTime()) / (60 * 60 * 1000);
      expect(hoursAgo).toBeCloseTo(24, 0);
    });

    it('rejects a Supervisor who is not this Sakhi’s assigned Supervisor', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      await expect(
        service.listRecentCallLogsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          otherSupervisorCaller,
          'Bearer token',
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findRecentCallLogsBySakhi).not.toHaveBeenCalled();
    });

    it('throws 404 when the Sakhi does not exist', async () => {
      sakhiClient.findById.mockResolvedValue(null);
      await expect(
        service.listRecentCallLogsBySakhi('missing', supervisorCaller, 'Bearer token'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('returns an empty array when no calls fall within the window', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.findRecentCallLogsBySakhi.mockResolvedValue([]);
      await expect(
        service.listRecentCallLogsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          supervisorCaller,
          'Bearer token',
        ),
      ).resolves.toEqual([]);
    });

    it('allows a MANAGER regardless of Sakhi assignment, without calling the Sakhi client', async () => {
      repository.findRecentCallLogsBySakhi.mockResolvedValue([callLogRow]);
      await expect(
        service.listRecentCallLogsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          managerCaller,
          'Bearer token',
        ),
      ).resolves.toEqual([callLogRow]);
      expect(sakhiClient.findById).not.toHaveBeenCalled();
    });

    it('allows an ADMIN regardless of Sakhi assignment, without calling the Sakhi client', async () => {
      repository.findRecentCallLogsBySakhi.mockResolvedValue([callLogRow]);
      await expect(
        service.listRecentCallLogsBySakhi(
          '44444444-4444-4444-4444-444444444444',
          adminCaller,
          'Bearer token',
        ),
      ).resolves.toEqual([callLogRow]);
      expect(sakhiClient.findById).not.toHaveBeenCalled();
    });
  });

  describe('getCallSheetStats', () => {
    const sakhiId = '44444444-4444-4444-4444-444444444444';
    const allKinds = [
      'VISIT_DUE',
      'VISIT_3_DAYS_TO_EXPIRE',
      'FOLLOWUP_PENDING',
      'CLOSURE_FORM_PENDING',
      'MISSED_VISIT',
      'HIGH_RISK_ANC',
      'HIGH_RISK_PNC',
    ];

    it('returns a real FOLLOWUP_PENDING count and a fixed 0 for every other kind', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      // Repository now only ever returns 0 or 1 (see its own doc comment on
      // why this isn't a plain count() of every CALL_BACK row) — 1 here
      // means this Sakhi's most recent call is still CALL_BACK.
      repository.countPendingFollowups.mockResolvedValue(1);

      const result = await service.getCallSheetStats(sakhiId, supervisorCaller, 'Bearer token');

      expect(result.sakhiId).toBe(sakhiId);
      expect(typeof result.lastDataSyncDate).toBe('string');
      expect(result.rows.map((r) => r.kind)).toEqual(allKinds);
      const followupRow = result.rows.find((r) => r.kind === 'FOLLOWUP_PENDING');
      expect(followupRow).toMatchObject({ count: 1, updated: 0 });
      for (const row of result.rows.filter((r) => r.kind !== 'FOLLOWUP_PENDING')) {
        expect(row).toMatchObject({ count: 0, updated: 0 });
      }
    });

    it('rejects a Supervisor who is not this Sakhi’s assigned Supervisor', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      await expect(
        service.getCallSheetStats(sakhiId, otherSupervisorCaller, 'Bearer token'),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.countPendingFollowups).not.toHaveBeenCalled();
    });

    it('throws 404 when the Sakhi does not exist', async () => {
      sakhiClient.findById.mockResolvedValue(null);
      await expect(
        service.getCallSheetStats('missing', supervisorCaller, 'Bearer token'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('allows a MANAGER regardless of Sakhi assignment', async () => {
      sakhiClient.findById.mockResolvedValue(sakhi);
      repository.countPendingFollowups.mockResolvedValue(0);
      await expect(
        service.getCallSheetStats(sakhiId, managerCaller, 'Bearer token'),
      ).resolves.toMatchObject({ sakhiId });
    });
  });

  describe('getCallSheetStatsBatch', () => {
    const ownedId = '44444444-4444-4444-4444-444444444444';
    const notOwnedId = '55555555-5555-5555-5555-555555555555';

    it('returns stats only for sakhiIds the caller may access, omitting the rest', async () => {
      sakhiClient.findById.mockImplementation(async (id) => {
        if (id === ownedId) return sakhi;
        if (id === notOwnedId)
          return { ...sakhi, sakhiId: notOwnedId, supervisorId: 'someone-else' };
        return null;
      });
      repository.countPendingFollowups.mockResolvedValue(1);

      const result = await service.getCallSheetStatsBatch(
        [ownedId, notOwnedId, 'missing-id'],
        supervisorCaller,
        'Bearer token',
      );

      expect(result).toHaveLength(1);
      expect(result[0].sakhiId).toBe(ownedId);
    });

    it('returns an empty array when none of the requested ids are accessible', async () => {
      sakhiClient.findById.mockResolvedValue(null);
      const result = await service.getCallSheetStatsBatch(
        ['missing-1', 'missing-2'],
        supervisorCaller,
        'Bearer token',
      );
      expect(result).toEqual([]);
    });

    it('propagates a genuine infra failure (e.g. badGateway from sakhiClient) instead of swallowing it as an empty result', async () => {
      const infraError = badGateway('auth-service is unreachable.');
      sakhiClient.findById.mockRejectedValue(infraError);

      await expect(
        service.getCallSheetStatsBatch([ownedId], supervisorCaller, 'Bearer token'),
      ).rejects.toBe(infraError);
    });
  });
});
