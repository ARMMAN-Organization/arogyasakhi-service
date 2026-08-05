import { NotificationService } from './notification.service';
import type { NotificationRepository } from './notification.repository';
import type { SakhiClient } from './sakhi.client';
import type { CreateNotificationInput } from './dto/create-notification.dto';

describe('NotificationService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<NotificationRepository>;
  const sakhiClient = { findById: jest.fn() } as unknown as jest.Mocked<SakhiClient>;
  let service: NotificationService;
  const authHeader = 'Bearer token';
  const supervisor = { id: 'supervisor-1', roles: ['SUPERVISOR'] };
  const admin = { id: 'admin-1', roles: ['ADMIN'] };

  const dto: CreateNotificationInput = {
    recipientUserId: 'sakhi-1',
    notificationType: 'REFERRAL_UPDATE',
    title: 'Referral updated',
    status: 'UNREAD',
    priority: 5,
  };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new NotificationService(repository, sakhiClient);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  it('ADMIN may notify any recipient without an ownership check', async () => {
    repository.create.mockResolvedValue({ id: '1' } as never);
    await service.create(dto, admin, authHeader);
    expect(sakhiClient.findById).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('SUPERVISOR notifying their own assigned Sakhi succeeds', async () => {
    sakhiClient.findById.mockResolvedValue({ sakhiId: 'sakhi-1', supervisorId: 'supervisor-1' });
    repository.create.mockResolvedValue({ id: '1' } as never);
    await service.create(dto, supervisor, authHeader);
    expect(sakhiClient.findById).toHaveBeenCalledWith('sakhi-1', authHeader);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('SUPERVISOR notifying a Sakhi assigned to someone else is forbidden', async () => {
    sakhiClient.findById.mockResolvedValue({ sakhiId: 'sakhi-1', supervisorId: 'someone-else' });
    await expect(service.create(dto, supervisor, authHeader)).rejects.toMatchObject({
      status: 403,
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('SUPERVISOR notifying an unknown recipientUserId is forbidden, not 404', async () => {
    sakhiClient.findById.mockResolvedValue(null);
    await expect(service.create(dto, supervisor, authHeader)).rejects.toMatchObject({
      status: 403,
    });
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(service.create(dto, admin, authHeader)).rejects.toThrow('db down');
  });
});
