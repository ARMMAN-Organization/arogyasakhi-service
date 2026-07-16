import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';
import { createNotificationRouter } from './notification.controller';

/**
 * Composition root for the notifications feature: wires repository → service → router.
 * Replaces the former NestJS module + DI container.
 */
export function createNotificationModule(prisma: PrismaService): DocumentedRouter {
  const repository = new NotificationRepository(prisma);
  const service = new NotificationService(repository);
  return createNotificationRouter(service);
}
