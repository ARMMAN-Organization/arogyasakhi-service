import type { AuditLogRepository } from './auditLog.repository';
import type { CreateAuditLogInput } from './dto/create-auditLog.dto';

/** Audit log domain logic. Data access is delegated to the repository. */
export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateAuditLogInput) {
    return this.repository.create(dto);
  }
}
