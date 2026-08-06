import { forbidden } from '@armman/service-commons';
import type { AuditLogRepository } from './auditLog.repository';
import type { CreateAuditLogInput } from './dto/create-auditLog.dto';

export interface CallerIdentity {
  id: string;
  roles: string[];
}

/** Audit log domain logic. Data access is delegated to the repository. */
export class AuditLogService {
  constructor(private readonly repository: AuditLogRepository) {}

  list() {
    return this.repository.findMany();
  }

  /**
   * ADMIN may log any entry as-is. A SUPERVISOR (the role widened for
   * approval-service's Quick Response decisions to forward through) may
   * only log their own QUICK_RESPONSE_* actions — actorUserId is forced to
   * the caller's own id (never the client-supplied value) and action must
   * be in that namespace, so the widened role can never forge an entry
   * attributed to someone else or write an arbitrary action/entityType.
   */
  create(dto: CreateAuditLogInput, caller: CallerIdentity) {
    if (!caller.roles.includes('ADMIN')) {
      if (!dto.action.startsWith('QUICK_RESPONSE_')) {
        throw forbidden('SUPERVISOR may only log QUICK_RESPONSE_* actions.');
      }
      return this.repository.create({ ...dto, actorUserId: caller.id });
    }
    return this.repository.create(dto);
  }
}
