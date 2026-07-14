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
    const rows = [
      {
        id: '1',
        recipientUserId: 'user-1',
        notificationType: 'MISSED_VISIT_ESCALATION' as const,
        title: 'Missed visit',
        body: 'Beneficiary missed a scheduled visit',
        priority: 5,
        ctaType: 'VIEW_VISIT',
        linkedEntityType: 'visit_instance',
        linkedEntityId: 'visit-1',
        status: 'UNREAD' as const,
        readAt: null,
        dismissedAt: null,
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
    const dto: CreateNotificationInput = {
      recipientUserId: 'user-1',
      notificationType: 'REFERRAL_UPDATE',
      title: 'Referral updated',
      status: 'UNREAD',
      priority: 5,
    };
    const created = {
      id: '1',
      recipientUserId: 'user-1',
      notificationType: 'REFERRAL_UPDATE' as const,
      title: 'Referral updated',
      body: null,
      priority: 5,
      ctaType: null,
      linkedEntityType: null,
      linkedEntityId: null,
      status: 'UNREAD' as const,
      readAt: null,
      dismissedAt: null,
      createdAt: new Date(),
      createdByUserId: null,
      updatedAt: new Date(),
      updatedByUserId: null,
      isDeleted: false,
      deletedAt: null,
    };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.create({
        recipientUserId: 'user-1',
        notificationType: 'REFERRAL_UPDATE',
        title: 'Referral updated',
        status: 'UNREAD',
        priority: 5,
      }),
    ).rejects.toThrow('db down');
  });
});
