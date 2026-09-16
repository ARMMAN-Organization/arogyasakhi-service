import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { HealthEducationRepository } from './healthEducation.repository';
import { HealthEducationService } from './healthEducation.service';
import { HealthEducationMediaStrapiClient } from './healthEducationMedia.strapiClient';
import { HealthEducationMediaSyncService } from './healthEducationMedia.syncService';
import { registerHealthEducationRoutes } from './healthEducation.routes';

/**
 * Composition root for the health education feature: wires repository →
 * service → routes, plus the Strapi media-sync service (manual/on-demand
 * — see healthEducationMedia.syncService.ts).
 */
export function createHealthEducationModule(prisma: PrismaService): DocumentedRouter {
  const repository = new HealthEducationRepository(prisma);
  const service = new HealthEducationService(repository);
  const strapiClient = new HealthEducationMediaStrapiClient();
  const mediaSyncService = new HealthEducationMediaSyncService(prisma, strapiClient);
  const doc = createDocumentedRouter();
  registerHealthEducationRoutes(doc, service, mediaSyncService);
  return doc;
}
