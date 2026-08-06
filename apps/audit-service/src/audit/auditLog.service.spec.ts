import { AuditLogService } from './auditLog.service';
import type { AuditLogRepository } from './auditLog.repository';
import type { CreateAuditLogInput } from './dto/create-auditLog.dto';

describe('AuditLogService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<AuditLogRepository>;
  let service: AuditLogService;
  const admin = { id: 'admin-1', roles: ['ADMIN'] };
  const supervisor = { id: 'supervisor-1', roles: ['SUPERVISOR'] };

  beforeEach(() => {
    jest.resetAllMocks();
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

  it('SUPERVISOR logging a non-QUICK_RESPONSE_ action is forbidden', () => {
    const dto: CreateAuditLogInput = {
      action: 'DELETE_EVERYTHING',
      entityType: 'Beneficiary',
    };
    expect(() => service.create(dto, supervisor)).toThrow(expect.objectContaining({ status: 403 }));
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.create({ action: 'CREATE', entityType: 'Beneficiary' }, admin),
    ).rejects.toThrow('db down');
  });
});
