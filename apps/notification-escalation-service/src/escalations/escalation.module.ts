import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { EscalationRepository } from './escalation.repository';
import { EscalationService } from './escalation.service';
import { registerEscalationRoutes } from './escalation.routes';
import { NotificationRepository } from '../notifications/notification.repository';

/**
 * Composition root for the escalations feature: wires repository → service → routes.
 * NotificationRepository is shared with the notifications module's own
 * composition root (same table, same in-process Prisma client) — the
 * Missed Visit Escalation CLOSE action writes to it directly rather than
 * round-tripping through this service's own gateway-exposed
 * POST /notifications, which exists for other *services* to call, not for
 * a sibling module in the same deployable.
 */
export function createEscalationModule(prisma: PrismaService): DocumentedRouter {
  const repository = new EscalationRepository(prisma);
  const notificationRepository = new NotificationRepository(prisma);
  const service = new EscalationService(repository, notificationRepository);
  const doc = createDocumentedRouter();
  registerEscalationRoutes(doc, service);
  return doc;
}
