import { OperationsService } from './operations.service';
import type { OperationsRepository } from './operations.repository';
import type { SakhiClient } from './sakhi.client';
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
    createInventoryItem: jest.fn(),
    findInventoryTransactions: jest.fn(),
    findInventoryTransactionsBySakhi: jest.fn(),
    findInventoryItemById: jest.fn(),
    findInventoryTransactionById: jest.fn(),
    createInventoryTransactions: jest.fn(),
    updateInventoryTransaction: jest.fn(),
    softDeleteInventoryTransaction: jest.fn(),
    findCallLogs: jest.fn(),
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
  });

  describe('createInventoryTransactions', () => {
    const baseDto = {
      projectId: '22222222-2222-2222-2222-222222222222',
      sakhiId: '44444444-4444-4444-4444-444444444444',
      transactionType: 'HANDOVER' as const,
      transactionDate: new Date('2026-07-01'),
      items: [{ itemId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', quantity: 2 }],
    };

    it('creates one row per item, using the caller’s own id as supervisorId (never client-supplied)', async () => {
      repository.findInventoryItemById.mockResolvedValue(activeItem);
      repository.createInventoryTransactions.mockResolvedValue([inventoryTransactionRow]);

      const result = await service.createInventoryTransactions(baseDto, supervisorCaller);

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

    it('rejects when a referenced item does not exist, without creating anything', async () => {
      repository.findInventoryItemById.mockResolvedValue(null);

      await expect(
        service.createInventoryTransactions(baseDto, supervisorCaller),
      ).rejects.toMatchObject({ status: 422 });
      expect(repository.createInventoryTransactions).not.toHaveBeenCalled();
    });

    it('rejects when a referenced item is inactive, without creating anything', async () => {
      repository.findInventoryItemById.mockResolvedValue({ ...activeItem, status: 'INACTIVE' });

      await expect(
        service.createInventoryTransactions(baseDto, supervisorCaller),
      ).rejects.toMatchObject({ status: 422 });
      expect(repository.createInventoryTransactions).not.toHaveBeenCalled();
    });

    it('creates multiple rows for a multi-item submission', async () => {
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

      await service.createInventoryTransactions(dto, supervisorCaller);

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
