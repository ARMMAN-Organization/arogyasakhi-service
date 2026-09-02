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
  const system = { id: 'system-1', roles: ['SYSTEM'] };
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

  it('SYSTEM may notify any recipient without an ownership check', async () => {
    // The missed-visit/referral-followup/sync-delay cron jobs' service-
    // account token sends recipientUserId values that are Supervisors, not
    // Sakhis — the Sakhi-roster ownership check below doesn't apply to it.
    repository.create.mockResolvedValue({ id: '1' } as never);
    await service.create(dto, system, authHeader);
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

  it('SAKHI notifying her own assigned Supervisor succeeds', async () => {
    const sakhiToSupervisorDto: CreateNotificationInput = {
      ...dto,
      recipientUserId: 'supervisor-1',
    };
    sakhiClient.findById.mockResolvedValue({
      sakhiId: 'jane.sakhi',
      supervisorId: 'supervisor-1',
    });
    repository.create.mockResolvedValue({ id: '1' } as never);

    await service.create(sakhiToSupervisorDto, sakhi, authHeader);

    expect(sakhiClient.findById).toHaveBeenCalledWith('jane.sakhi', authHeader);
    expect(repository.create).toHaveBeenCalledWith(sakhiToSupervisorDto);
  });

  it('SAKHI notifying a Supervisor who is not her own is forbidden', async () => {
    const sakhiToOtherSupervisorDto: CreateNotificationInput = {
      ...dto,
      recipientUserId: 'someone-elses-supervisor',
    };
    sakhiClient.findById.mockResolvedValue({
      sakhiId: 'jane.sakhi',
      supervisorId: 'supervisor-1',
    });

    await expect(
      service.create(sakhiToOtherSupervisorDto, sakhi, authHeader),
    ).rejects.toMatchObject({ status: 403 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('SAKHI notifying herself is forbidden', async () => {
    const sakhiToSelfDto: CreateNotificationInput = { ...dto, recipientUserId: 'jane.sakhi' };
    sakhiClient.findById.mockResolvedValue({
      sakhiId: 'jane.sakhi',
      supervisorId: 'supervisor-1',
    });

    await expect(service.create(sakhiToSelfDto, sakhi, authHeader)).rejects.toMatchObject({
      status: 403,
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('SAKHI caller whose own Sakhi record is not found is forbidden, not 404', async () => {
    sakhiClient.findById.mockResolvedValue(null);
    await expect(service.create(dto, sakhi, authHeader)).rejects.toMatchObject({ status: 403 });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('a caller who holds both ADMIN and SAKHI roles gets the ADMIN bypass, not the SAKHI ownership check', async () => {
    const adminAndSakhi = { id: 'admin-1', roles: ['ADMIN', 'SAKHI'] };
    repository.create.mockResolvedValue({ id: '1' } as never);

    await service.create(dto, adminAndSakhi, authHeader);

    expect(sakhiClient.findById).not.toHaveBeenCalled();
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('a caller who holds both SUPERVISOR and SAKHI roles gets the SUPERVISOR ownership check, not the SAKHI one', async () => {
    const supervisorAndSakhi = { id: 'supervisor-1', roles: ['SUPERVISOR', 'SAKHI'] };
    sakhiClient.findById.mockResolvedValue({ sakhiId: 'sakhi-1', supervisorId: 'supervisor-1' });
    repository.create.mockResolvedValue({ id: '1' } as never);

    await service.create(dto, supervisorAndSakhi, authHeader);

    // Looked up by dto.recipientUserId ('sakhi-1'), not by the caller's own
    // id — proves the SUPERVISOR branch ran, not the SAKHI one (which would
    // have looked up the caller's own id instead).
    expect(sakhiClient.findById).toHaveBeenCalledWith('sakhi-1', authHeader);
    expect(repository.create).toHaveBeenCalledWith(dto);
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

    it('does NOT notify the assigned Supervisor for DATA_RESTORE_UPDATE', async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);
      sakhiClient.findById.mockResolvedValue({
        sakhiId: 'sakhi-1',
        supervisorId: 'supervisor-9',
      });

      await service.create(dataRestoreDto, admin, authHeader);

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(dataRestoreDto);
    });

    it('does NOT notify the assigned Supervisor for CLOSURE_REVIEW_UPDATE', async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);
      sakhiClient.findById.mockResolvedValue({
        sakhiId: 'sakhi-1',
        supervisorId: 'supervisor-9',
      });

      await service.create(closureReviewDto, admin, authHeader);

      expect(repository.create).toHaveBeenCalledTimes(1);
      expect(repository.create).toHaveBeenCalledWith(closureReviewDto);
    });

    it('does NOT notify the assigned Supervisor when the Sakhi has no assigned Supervisor for DATA_RESTORE_UPDATE', async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);
      sakhiClient.findById.mockResolvedValue({ sakhiId: 'sakhi-1', supervisorId: null });

      await service.create(dataRestoreDto, admin, authHeader);

      expect(repository.create).toHaveBeenCalledTimes(1);
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
