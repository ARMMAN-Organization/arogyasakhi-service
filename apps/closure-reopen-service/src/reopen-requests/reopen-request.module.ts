import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { ReopenRequestRepository } from './reopen-request.repository';
import { ReopenRequestService } from './reopen-request.service';
import { createReopenRequestRouter } from './reopen-request.controller';
import { AuditClient } from './audit.client';
import { NotificationClient } from './notification.client';

/**
 * Composition root for the reopen-requests feature: wires repository → service → router.
 */
export function createReopenRequestModule(prisma: PrismaService): DocumentedRouter {
  const repository = new ReopenRequestRepository(prisma);
  const auditClient = new AuditClient();
  const notificationClient = new NotificationClient();
  const service = new ReopenRequestService(repository, auditClient, notificationClient);
  return createReopenRequestRouter(service);
}
