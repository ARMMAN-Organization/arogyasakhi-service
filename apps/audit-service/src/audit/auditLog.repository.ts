import type { PrismaService } from '../prisma/prisma.service';
import type { CreateAuditLogInput } from './dto/create-auditLog.dto';

/** Data access for audit logs. Owns only this service's `auditLog` table. */
export class AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateAuditLogInput) {
    return this.prisma.auditLog.create({ data });
  }
}
