import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { AuditLogRepository } from './auditLog.repository';
import { AuditLogService } from './auditLog.service';
import { registerAuditLogRoutes } from './auditLog.routes';

/**
 * Composition root for the audit feature: wires repository → service → routes.
 * Replaces the former NestJS module + DI container.
 */
export function createAuditLogModule(prisma: PrismaService): DocumentedRouter {
  const repository = new AuditLogRepository(prisma);
  const service = new AuditLogService(repository);
  const doc = createDocumentedRouter();
  registerAuditLogRoutes(doc, service);
  return doc;
}
