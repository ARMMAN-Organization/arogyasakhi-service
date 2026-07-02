import { Injectable } from '@nestjs/common';
import { AuditLogRepository } from './auditLog.repository';
import type { CreateAuditLogDto } from './dto/create-auditLog.dto';

@Injectable()
export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}
  list() { return this.repository.findMany(); }
  create(dto: CreateAuditLogDto) { return this.repository.create(dto); }
}
