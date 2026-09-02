import { AuditLogService } from './auditLog.service';
import type { AuditLogRepository } from './auditLog.repository';
import type { CreateAuditLogInput } from './dto/create-auditLog.dto';

/** Mimics Prisma's P2002 unique-constraint-violation error shape. */
function uniqueConstraintError(): unknown {
  return { code: 'P2002' };
}

describe('AuditLogService', () => {
  const repository = {
    findMany: jest.fn(),
    findByLocalAuditUuid: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<AuditLogRepository>;
  let service: AuditLogService;
  const admin = { id: 'admin-1', roles: ['ADMIN'] };
  const supervisor = { id: 'supervisor-1', roles: ['SUPERVISOR'] };
  const sakhi = { id: 'sakhi-1', roles: ['SAKHI'] };

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findByLocalAuditUuid.mockResolvedValue(null);
    service = new AuditLogService(repository);
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
        actorUserId: 'user-1',
        action: 'CREATE',
        entityType: 'Beneficiary',
        entityId: 'entity-1',
        beforeJson: null,
        afterJson: { status: 'active' },
        ipAddress: '127.0.0.1',
        deviceId: 'device-1',
        createdAt: new Date(),
        localAuditUuid: null,
      },
    ];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('ADMIN creates any entry as-is', async () => {
    const dto: CreateAuditLogInput = {
      actorUserId: 'user-1',
      action: 'CREATE',
      entityType: 'Beneficiary',
      entityId: 'entity-1',
    };
    const created = {
      id: '1',
      actorUserId: dto.actorUserId ?? null,
      action: dto.action,
      entityType: dto.entityType,
      entityId: dto.entityId ?? null,
      beforeJson: null,
      afterJson: null,
      ipAddress: null,
      deviceId: null,
      createdAt: new Date(),
      localAuditUuid: null,
    };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto, admin)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('SUPERVISOR logging a QUICK_RESPONSE_ action has actorUserId forced to their own id', async () => {
    const dto: CreateAuditLogInput = {
      actorUserId: 'someone-else',
      action: 'QUICK_RESPONSE_APPROVE',
      entityType: 'ReopenRequest',
      entityId: 'reopen-1',
    };
    repository.create.mockResolvedValue({ id: '1' } as never);
    await service.create(dto, supervisor);
    expect(repository.create).toHaveBeenCalledWith({ ...dto, actorUserId: 'supervisor-1' });
  });

  it('SUPERVISOR logging a non-QUICK_RESPONSE_ action is forbidden', async () => {
    const dto: CreateAuditLogInput = {
      action: 'DELETE_EVERYTHING',
      entityType: 'Beneficiary',
    };
    await expect(service.create(dto, supervisor)).rejects.toThrow(
      expect.objectContaining({ status: 403 }),
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.create({ action: 'CREATE', entityType: 'Beneficiary' }, admin),
    ).rejects.toThrow('db down');
  });

  describe('SAKHI allowlist', () => {
    it.each(['LMP_CHANGE_APPROVED', 'LMP_CHANGE_REJECTED', 'FORM_ANSWER_EDIT'])(
      'SAKHI logging %s with their own actorUserId succeeds',
      async (action) => {
        const dto: CreateAuditLogInput = {
          actorUserId: 'sakhi-1',
          action,
          entityType: 'Beneficiary',
          entityId: 'entity-1',
        };
        repository.create.mockResolvedValue({ id: '1' } as never);
        await service.create(dto, sakhi);
        expect(repository.create).toHaveBeenCalledWith({ ...dto, actorUserId: 'sakhi-1' });
      },
    );

    it('SAKHI logging a non-allowlisted action is forbidden', async () => {
      const dto: CreateAuditLogInput = {
        action: 'ADMIN_OVERRIDE',
        entityType: 'Beneficiary',
      };
      await expect(service.create(dto, sakhi)).rejects.toThrow(
        expect.objectContaining({ status: 403 }),
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('SAKHI setting actorUserId to a different user is forbidden (not silently overridden)', async () => {
      const dto: CreateAuditLogInput = {
        actorUserId: 'someone-else',
        action: 'LMP_CHANGE_APPROVED',
        entityType: 'ApprovalRequest',
        entityId: 'req-1',
      };
      await expect(service.create(dto, sakhi)).rejects.toThrow(
        expect.objectContaining({ status: 403 }),
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('SAKHI omitting actorUserId defaults to their own id', async () => {
      const dto: CreateAuditLogInput = {
        action: 'FORM_ANSWER_EDIT',
        entityType: 'FormSubmission',
      };
      repository.create.mockResolvedValue({ id: '1' } as never);
      await service.create(dto, sakhi);
      expect(repository.create).toHaveBeenCalledWith({ ...dto, actorUserId: 'sakhi-1' });
    });
  });

  describe('idempotency via localAuditUuid', () => {
    it('a second create() with the same localAuditUuid returns the existing row without inserting again', async () => {
      const dto: CreateAuditLogInput = {
        actorUserId: 'user-1',
        action: 'CREATE',
        entityType: 'Beneficiary',
        entityId: 'entity-1',
        localAuditUuid: 'device-abc-001',
      };
      // Matches dto on actorUserId/action/entityType/entityId — a genuine
      // replay of the same logical write, so it must be returned as-is.
      const existing = { id: 'existing-1', ...dto } as never;
      repository.findByLocalAuditUuid.mockResolvedValue(existing);

      await expect(service.create(dto, admin)).resolves.toBe(existing);
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('creates a new row when localAuditUuid has not been seen before', async () => {
      repository.findByLocalAuditUuid.mockResolvedValue(null);
      const created = { id: 'new-1' } as never;
      repository.create.mockResolvedValue(created);

      const dto: CreateAuditLogInput = {
        action: 'CREATE',
        entityType: 'Beneficiary',
        localAuditUuid: 'device-abc-002',
      };
      await expect(service.create(dto, admin)).resolves.toBe(created);
      expect(repository.create).toHaveBeenCalledWith(dto);
    });

    it('a concurrent P2002 race on localAuditUuid is resolved to the winning row, not a 500', async () => {
      const dto: CreateAuditLogInput = {
        actorUserId: 'user-1',
        action: 'CREATE',
        entityType: 'Beneficiary',
        entityId: 'entity-1',
        localAuditUuid: 'device-abc-003',
      };
      repository.findByLocalAuditUuid.mockResolvedValueOnce(null);
      repository.create.mockRejectedValue(uniqueConstraintError());
      // The row that won the race matches dto on the identity fields — i.e.
      // the race was two attempts at the SAME logical write, a safe replay.
      const winner = { id: 'winner-1', ...dto } as never;
      repository.findByLocalAuditUuid.mockResolvedValueOnce(winner);

      await expect(service.create(dto, admin)).resolves.toBe(winner);
    });

    it('rejects with 409 when localAuditUuid already exists on a DIFFERENT actor/action row (cross-actor IDOR)', async () => {
      // A SAKHI submits a validly-allowlisted action/actorUserId (their own),
      // but the localAuditUuid they supply already exists on an unrelated
      // row written earlier by a SUPERVISOR for a completely different
      // action/entity. The idempotency lookup must not silently return that
      // other row's contents — it must reject as a genuine UUID collision.
      const unrelatedRow = {
        id: 'other-row-1',
        actorUserId: 'supervisor-1',
        action: 'QUICK_RESPONSE_REJECT_LOAN',
        entityType: 'ReopenRequest',
        entityId: 'reopen-99',
        beforeJson: null,
        afterJson: { secret: 'unrelated case data' },
        localAuditUuid: 'reused-uuid-from-sakhi',
      } as never;
      repository.findByLocalAuditUuid.mockResolvedValue(unrelatedRow);

      const dto: CreateAuditLogInput = {
        actorUserId: 'sakhi-1',
        action: 'LMP_CHANGE_APPROVED',
        entityType: 'ApprovalRequest',
        entityId: 'req-1',
        localAuditUuid: 'reused-uuid-from-sakhi',
      };

      await expect(service.create(dto, sakhi)).rejects.toThrow(
        expect.objectContaining({ status: 409 }),
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('rejects with 409 on the P2002 race path when the winning row belongs to a different logical write', async () => {
      const dto: CreateAuditLogInput = {
        actorUserId: 'user-1',
        action: 'CREATE',
        entityType: 'Beneficiary',
        entityId: 'entity-1',
        localAuditUuid: 'device-abc-race-mismatch',
      };
      repository.findByLocalAuditUuid.mockResolvedValueOnce(null);
      repository.create.mockRejectedValue(uniqueConstraintError());
      // The row that won the race belongs to a different actor/entity than
      // this dto — a genuine collision, not the same logical write racing.
      const winner = {
        id: 'winner-mismatch-1',
        actorUserId: 'someone-else',
        action: 'CREATE',
        entityType: 'Beneficiary',
        entityId: 'entity-999',
        localAuditUuid: 'device-abc-race-mismatch',
      } as never;
      repository.findByLocalAuditUuid.mockResolvedValueOnce(winner);

      await expect(service.create(dto, admin)).rejects.toThrow(
        expect.objectContaining({ status: 409 }),
      );
    });

    it('re-throws a non-unique-constraint error even with localAuditUuid set', async () => {
      repository.findByLocalAuditUuid.mockResolvedValue(null);
      repository.create.mockRejectedValue(new Error('db down'));

      const dto: CreateAuditLogInput = {
        action: 'CREATE',
        entityType: 'Beneficiary',
        localAuditUuid: 'device-abc-004',
      };
      await expect(service.create(dto, admin)).rejects.toThrow('db down');
    });

    it('does not consult findByLocalAuditUuid when localAuditUuid is absent', async () => {
      repository.create.mockResolvedValue({ id: '1' } as never);
      await service.create({ action: 'CREATE', entityType: 'Beneficiary' }, admin);
      expect(repository.findByLocalAuditUuid).not.toHaveBeenCalled();
    });
  });
});
