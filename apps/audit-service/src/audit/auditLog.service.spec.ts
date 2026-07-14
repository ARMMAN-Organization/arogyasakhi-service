import { AuditLogService } from './auditLog.service';
import type { AuditLogRepository } from './auditLog.repository';
import type { CreateAuditLogInput } from './dto/create-auditLog.dto';

describe('AuditLogService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<AuditLogRepository>;
  let service: AuditLogService;

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

  it('creates via repository with the given data', async () => {
    const dto: CreateAuditLogInput = {
      actorUserId: 'user-1',
      action: 'CREATE',
      entityType: 'Beneficiary',
      entityId: 'entity-1',
      beforeJson: { status: 'inactive' },
      afterJson: { status: 'active' },
      ipAddress: '127.0.0.1',
      deviceId: 'device-1',
    };
    const created = {
      id: '1',
      actorUserId: dto.actorUserId ?? null,
      action: dto.action,
      entityType: dto.entityType,
      entityId: dto.entityId ?? null,
      beforeJson: dto.beforeJson ?? null,
      afterJson: dto.afterJson ?? null,
      ipAddress: dto.ipAddress ?? null,
      deviceId: dto.deviceId ?? null,
      createdAt: new Date(),
    };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(service.create({ action: 'CREATE', entityType: 'Beneficiary' })).rejects.toThrow(
      'db down',
    );
  });
});
