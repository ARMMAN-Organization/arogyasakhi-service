import { NotificationService } from './notification.service';
import type { NotificationRepository } from './notification.repository';
import type { CreateNotificationInput } from './dto/create-notification.dto';

describe('NotificationService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<NotificationRepository>;
  let service: NotificationService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new NotificationService(repository);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns the repository list unchanged', async () => {
    const rows = [{ id: '1', name: 'a', createdAt: new Date(), updatedAt: new Date() }];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('creates via repository with the given data', async () => {
    const dto: CreateNotificationInput = { name: 'device-1' };
    const created = { id: '1', name: 'device-1', createdAt: new Date(), updatedAt: new Date() };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(service.create({ name: 'x' })).rejects.toThrow('db down');
  });
});
