import type { PrismaService } from '../prisma/prisma.service';
import type { CreateAuditLogInput } from './dto/create-auditLog.dto';

/** Data access for audit logs. Owns only this service's `auditLog` table. */
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  /**
   * Finds an audit log entry previously created from this exact
   * client-generated localAuditUuid — lets create() treat a
   * dropped-connection retry as an idempotent replay instead of a new entry.
   */
  findByLocalAuditUuid(localAuditUuid: string) {
    return this.prisma.auditLog.findFirst({ where: { localAuditUuid } });
  }

  create(data: CreateAuditLogInput) {
    return this.prisma.auditLog.create({ data });
  }
}
