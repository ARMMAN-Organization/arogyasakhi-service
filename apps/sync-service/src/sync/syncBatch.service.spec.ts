import { SyncBatchService } from './syncBatch.service';
import type { SyncBatchRepository } from './syncBatch.repository';
import type { CreateSyncBatchInput } from './dto/create-syncBatch.dto';

describe('SyncBatchService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<SyncBatchRepository>;
  let service: SyncBatchService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new SyncBatchService(repository);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns the repository list unchanged', async () => {
    const rows = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        deviceId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        direction: 'UPLOAD' as const,
        startedAt: new Date(),
        completedAt: null,
        status: 'STARTED' as const,
        appVersion: '1.0.0',
        networkType: 'WIFI' as const,
        createdAt: new Date(),
        createdByUserId: null,
        updatedAt: new Date(),
        updatedByUserId: null,
        isDeleted: false,
        deletedAt: null,
      },
    ];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('creates via repository with the given data', async () => {
    const dto: CreateSyncBatchInput = {
      deviceId: '22222222-2222-2222-2222-222222222222',
      userId: '33333333-3333-3333-3333-333333333333',
      direction: 'UPLOAD',
      startedAt: new Date(),
      status: 'STARTED',
      appVersion: '1.0.0',
      networkType: 'WIFI',
    };
    const created = {
      id: '11111111-1111-1111-1111-111111111111',
      deviceId: dto.deviceId,
      userId: dto.userId,
      direction: dto.direction,
      startedAt: dto.startedAt,
      completedAt: null as Date | null,
      status: dto.status,
      appVersion: dto.appVersion ?? null,
      networkType: dto.networkType ?? null,
      createdAt: new Date(),
      createdByUserId: null as string | null,
      updatedAt: new Date(),
      updatedByUserId: null as string | null,
      isDeleted: false,
      deletedAt: null as Date | null,
    };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.create({
        deviceId: '22222222-2222-2222-2222-222222222222',
        userId: '33333333-3333-3333-3333-333333333333',
        direction: 'UPLOAD',
        startedAt: new Date(),
        status: 'STARTED',
      }),
    ).rejects.toThrow('db down');
  });
});
