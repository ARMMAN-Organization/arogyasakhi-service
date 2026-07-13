import type { Router } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { AuditLogRepository } from './auditLog.repository';
import { AuditLogService } from './auditLog.service';
import { createAuditLogRouter } from './auditLog.controller';

/**
 * Composition root for the audit feature: wires repository → service → router.
 * Replaces the former NestJS module + DI container.
 */
export function createAuditLogModule(prisma: PrismaService): Router {
  const repository = new AuditLogRepository(prisma);
  const service = new AuditLogService(repository);
  return createAuditLogRouter(service);
}
