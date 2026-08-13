import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { ClosureRepository } from './closure.repository';
import { ClosureService } from './closure.service';
import { registerClosureRoutes } from './closure.routes';
import { ApprovalClient } from '../reopen-requests/approval.client';
import { LookupClient } from '../reopen-requests/lookup.client';
import { NotificationClient } from '../reopen-requests/notification.client';

/**
 * Composition root for the closures feature: wires repository → service → routes.
 * Replaces the former NestJS module + DI container.
 */
export function createClosureModule(prisma: PrismaService): DocumentedRouter {
  const repository = new ClosureRepository(prisma);
  const approvalClient = new ApprovalClient();
  const lookupClient = new LookupClient();
  const notificationClient = new NotificationClient();
  const service = new ClosureService(repository, approvalClient, lookupClient, notificationClient);
  const doc = createDocumentedRouter();
  registerClosureRoutes(doc, service);
  return doc;
}
