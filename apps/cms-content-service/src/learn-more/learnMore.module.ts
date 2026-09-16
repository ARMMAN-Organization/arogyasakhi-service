import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { LearnMoreRepository } from './learnMore.repository';
import { LearnMoreService } from './learnMore.service';
import { LearnMoreStrapiClient } from './learnMore.strapiClient';
import { LearnMoreSyncService } from './learnMore.syncService';
import { registerLearnMoreRoutes } from './learnMore.routes';

/**
 * Composition root for the Learn More feature: wires repository → service →
 * routes, plus the Strapi sync service (manual/on-demand — see
 * docs/test-runs/learn-more-strapi-sync-test-cases.md).
 */
export function createLearnMoreModule(prisma: PrismaService): DocumentedRouter {
  const repository = new LearnMoreRepository(prisma);
  const service = new LearnMoreService(repository);
  const strapiClient = new LearnMoreStrapiClient();
  const syncService = new LearnMoreSyncService(prisma, strapiClient);
  const doc = createDocumentedRouter();
  registerLearnMoreRoutes(doc, service, syncService);
  return doc;
}
