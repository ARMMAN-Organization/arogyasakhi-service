import { NotificationService } from './notification.service';
import type { NotificationRepository } from './notification.repository';
import type { SakhiClient } from './sakhi.client';
import type { CreateNotificationInput } from './dto/create-notification.dto';

describe('NotificationService', () => {
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
  } as unknown as jest.Mocked<NotificationRepository>;
  const sakhiClient = { findById: jest.fn() } as unknown as jest.Mocked<SakhiClient>;
  let service: NotificationService;
  const authHeader = 'Bearer token';
  const supervisor = { id: 'supervisor-1', roles: ['SUPERVISOR'] };
  const admin = { id: 'admin-1', roles: ['ADMIN'] };
  const sakhi = { id: 'jane.sakhi', roles: ['SAKHI'] };

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

  it("lists only the caller's own notifications via repository", async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list(sakhi)).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledWith('jane.sakhi');
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

  describe('supervisor fan-out', () => {
    const escalationDto: CreateNotificationInput = {
      ...dto,
      notificationType: 'MISSED_VISIT_ESCALATION',
    };
    const transferDto: CreateNotificationInput = {
      ...dto,
      notificationType: 'BENEFICIARY_TRANSFER_NOTICE',
    };
    const dataRestoreDto: CreateNotificationInput = {
      ...dto,
      notificationType: 'DATA_RESTORE_UPDATE',
    };
    const closureReviewDto: CreateNotificationInput = {
      ...dto,
      notificationType: 'CLOSURE_REVIEW_UPDATE',
    };

    it('also notifies the assigned Supervisor for MISSED_VISIT_ESCALATION', async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);
      sakhiClient.findById.mockResolvedValue({
        sakhiId: 'sakhi-1',
        supervisorId: 'supervisor-9',
      });

      await service.create(escalationDto, admin, authHeader);

      expect(repository.create).toHaveBeenNthCalledWith(1, escalationDto);
      expect(repository.create).toHaveBeenNthCalledWith(2, {
        ...escalationDto,
        recipientUserId: 'supervisor-9',
      });
    });

    it('also notifies the assigned Supervisor for BENEFICIARY_TRANSFER_NOTICE', async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);
      sakhiClient.findById.mockResolvedValue({
        sakhiId: 'sakhi-1',
        supervisorId: 'supervisor-9',
      });

      await service.create(transferDto, admin, authHeader);

      expect(repository.create).toHaveBeenCalledTimes(2);
      expect(repository.create).toHaveBeenNthCalledWith(2, {
        ...transferDto,
        recipientUserId: 'supervisor-9',
      });
    });

    it('also notifies the assigned Supervisor for DATA_RESTORE_UPDATE', async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);
      sakhiClient.findById.mockResolvedValue({
        sakhiId: 'sakhi-1',
        supervisorId: 'supervisor-9',
      });

      await service.create(dataRestoreDto, admin, authHeader);

      expect(repository.create).toHaveBeenCalledTimes(2);
      expect(repository.create).toHaveBeenNthCalledWith(2, {
        ...dataRestoreDto,
        recipientUserId: 'supervisor-9',
      });
    });

    it('also notifies the assigned Supervisor for CLOSURE_REVIEW_UPDATE', async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);
      sakhiClient.findById.mockResolvedValue({
        sakhiId: 'sakhi-1',
        supervisorId: 'supervisor-9',
      });

      await service.create(closureReviewDto, admin, authHeader);

      expect(repository.create).toHaveBeenCalledTimes(2);
      expect(repository.create).toHaveBeenNthCalledWith(2, {
        ...closureReviewDto,
        recipientUserId: 'supervisor-9',
      });
    });

    it('does not fan out for non-escalation notification types', async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);

      await service.create(dto, admin, authHeader);

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(sakhiClient.findById).not.toHaveBeenCalled();
    });

    it('does not fan out when the Sakhi has no assigned Supervisor', async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);
      sakhiClient.findById.mockResolvedValue({ sakhiId: 'sakhi-1', supervisorId: null });

      await service.create(escalationDto, admin, authHeader);

      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('does not fan out to the same user twice if supervisorId equals the recipient', async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);
      sakhiClient.findById.mockResolvedValue({
        sakhiId: 'sakhi-1',
        supervisorId: escalationDto.recipientUserId,
      });

      await service.create(escalationDto, admin, authHeader);

      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it('the Sakhi notification still succeeds even if the Supervisor lookup fails', async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);
      sakhiClient.findById.mockRejectedValue(new Error('auth-service down'));

      await expect(service.create(escalationDto, admin, authHeader)).resolves.toEqual({
        id: '1',
      });
      expect(repository.create).toHaveBeenCalledTimes(1);
    });

    it("a SUPERVISOR caller who is also the Sakhi's own assigned Supervisor gets fanned out to as normal", async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);
      sakhiClient.findById.mockResolvedValue({
        sakhiId: 'sakhi-1',
        supervisorId: 'supervisor-1',
      });

      await service.create(escalationDto, supervisor, authHeader);

      expect(repository.create).toHaveBeenCalledTimes(2);
      expect(repository.create).toHaveBeenNthCalledWith(2, {
        ...escalationDto,
        recipientUserId: 'supervisor-1',
      });
    });
  });

  describe('updateStatus', () => {
    const notification = {
      id: 'notif-1',
      recipientUserId: 'jane.sakhi',
      status: 'UNREAD',
    };

    it('the recipient marking their own notification READ succeeds', async () => {
      repository.findById.mockResolvedValue(notification as never);
      repository.updateStatus.mockResolvedValue(true);
      repository.findById.mockResolvedValueOnce(notification as never).mockResolvedValueOnce({
        ...notification,
        status: 'READ',
      } as never);

      const result = await service.updateStatus('notif-1', 'READ', sakhi);

      expect(repository.updateStatus).toHaveBeenCalledWith('notif-1', 'jane.sakhi', 'READ');
      expect(result).toMatchObject({ status: 'READ' });
    });

    it('the recipient marking their own notification DISMISSED succeeds', async () => {
      repository.findById.mockResolvedValue(notification as never);
      repository.updateStatus.mockResolvedValue(true);

      await service.updateStatus('notif-1', 'DISMISSED', sakhi);

      expect(repository.updateStatus).toHaveBeenCalledWith('notif-1', 'jane.sakhi', 'DISMISSED');
    });

    it('404s on an unknown notification id', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.updateStatus('unknown-id', 'READ', sakhi)).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it("403s when the caller is not the notification's recipient", async () => {
      repository.findById.mockResolvedValue(notification as never);
      await expect(service.updateStatus('notif-1', 'READ', supervisor)).rejects.toMatchObject({
        status: 403,
      });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('404s when the conditional update races with a concurrent delete', async () => {
      repository.findById.mockResolvedValue(notification as never);
      repository.updateStatus.mockResolvedValue(false);
      await expect(service.updateStatus('notif-1', 'READ', sakhi)).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
