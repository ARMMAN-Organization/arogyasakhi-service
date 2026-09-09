import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { AnalyticsEventRepository } from './analyticsEvent.repository';
import { AnalyticsEventService } from './analyticsEvent.service';
import { registerAnalyticsEventRoutes } from './analyticsEvent.routes';

/**
 * Composition root for the analytics-event feature: wires
 * repository -> service -> routes. Same convention as audit-service's own
 * auditLog.module.ts.
 */
export function createAnalyticsEventModule(prisma: PrismaService): DocumentedRouter {
  const repository = new AnalyticsEventRepository(prisma);
  const service = new AnalyticsEventService(repository);
  const doc = createDocumentedRouter();
  registerAnalyticsEventRoutes(doc, service);
  return doc;
}
