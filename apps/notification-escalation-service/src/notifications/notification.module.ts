import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';
import { SakhiClient } from './sakhi.client';
import { registerNotificationRoutes } from './notification.routes';

/**
 * Composition root for the notifications feature: wires repository → service → routes.
 * Replaces the former NestJS module + DI container.
 */
export function createNotificationModule(prisma: PrismaService): DocumentedRouter {
  const repository = new NotificationRepository(prisma);
  const service = new NotificationService(repository, new SakhiClient());
  const doc = createDocumentedRouter();
  registerNotificationRoutes(doc, service);
  return doc;
}
