import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthEducationRepository } from './healthEducation.repository';
import { HealthEducationService } from './healthEducation.service';
import { registerHealthEducationRoutes } from './healthEducation.routes';

/**
 * Composition root for the health education feature: wires repository →
 * service → routes.
 */
export function createHealthEducationModule(prisma: PrismaService): DocumentedRouter {
  const repository = new HealthEducationRepository(prisma);
  const service = new HealthEducationService(repository);
  const doc = createDocumentedRouter();
  registerHealthEducationRoutes(doc, service);
  return doc;
}
