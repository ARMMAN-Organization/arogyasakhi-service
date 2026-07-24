import { OperationsService } from './operations.service';
import type { OperationsRepository } from './operations.repository';
import type { CreateSupervisorEventInput } from './dto/create-supervisorEvent.dto';
import type {
  SupervisorEvent,
  InventoryItem,
  InventoryTransaction,
  CallLog,
} from '../../../../node_modules/.prisma/client-supervisor-operations-service';

describe('OperationsService', () => {
  const repository = {
    findEvents: jest.fn(),
    createEvent: jest.fn(),
    findInventoryItems: jest.fn(),
    findInventoryTransactions: jest.fn(),
    findCallLogs: jest.fn(),
  } as unknown as jest.Mocked<OperationsRepository>;
  let service: OperationsService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new OperationsService(repository);
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

  it('rejects a COMPLETED event with no photoMediaId without hitting the repository', () => {
    expect(() =>
      service.createEvent({
        projectId: '22222222-2222-2222-2222-222222222222',
        supervisorId: '33333333-3333-3333-3333-333333333333',
        eventType: 'MEETING',
        eventDate: new Date('2026-07-01'),
        topicsJson: ['review'],
        status: 'COMPLETED',
      }),
    ).toThrow('photoMediaId is required when status is COMPLETED.');
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

  it('lists call logs via repository', async () => {
    const rows: CallLog[] = [
      {
        id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
        projectId: '22222222-2222-2222-2222-222222222222',
        supervisorId: '33333333-3333-3333-3333-333333333333',
        sakhiId: '44444444-4444-4444-4444-444444444444',
        callDatetime: new Date('2026-07-01T10:00:00Z'),
        callStatus: 'CONNECTED',
        notes: null,
        followupAction: null,
        callStartAt: new Date('2026-07-01T10:00:00Z'),
        callEndAt: new Date('2026-07-01T10:05:00Z'),
        callDurationSeconds: 300,
        createdAt: new Date(),
        createdByUserId: null,
        updatedAt: new Date(),
        updatedByUserId: null,
        isDeleted: false,
        deletedAt: null,
      },
    ];
    repository.findCallLogs.mockResolvedValue(rows);
    await expect(service.listCallLogs()).resolves.toBe(rows);
  });
});
