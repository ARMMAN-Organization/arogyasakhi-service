import { Test } from '@nestjs/testing';
import { AuditLogRepository } from './auditLog.repository';
import { AuditLogService } from './auditLog.service';

describe('AuditLogService', () => {
  let service: AuditLogService;
  const repository = { findMany: jest.fn(), create: jest.fn() };
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AuditLogService, { provide: AuditLogRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(AuditLogService);
  });
  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
  });
});
