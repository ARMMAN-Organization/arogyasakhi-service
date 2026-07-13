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
    const rows = [{ id: '1', name: 'a', createdAt: new Date(), updatedAt: new Date() }];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('creates via repository with the given data', async () => {
    const dto: CreateAuditLogInput = { name: 'device-1' };
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
