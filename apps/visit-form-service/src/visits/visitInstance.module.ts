import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { VisitInstanceRepository } from './visitInstance.repository';
import { VisitInstanceService } from './visitInstance.service';
import { registerVisitInstanceRoutes } from './visitInstance.routes';

/**
 * Composition root for the visits feature: wires repository → service → routes.
 * Replaces the former NestJS module + DI container.
 */
export function createVisitInstanceModule(prisma: PrismaService): DocumentedRouter {
  const repository = new VisitInstanceRepository(prisma);
  const service = new VisitInstanceService(repository);
  const doc = createDocumentedRouter();
  registerVisitInstanceRoutes(doc, service);
  return doc;
}
