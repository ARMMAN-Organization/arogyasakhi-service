import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { LearnMoreRepository } from './learnMore.repository';
import { LearnMoreService } from './learnMore.service';
import { registerLearnMoreRoutes } from './learnMore.routes';

/**
 * Composition root for the Learn More feature: wires repository → service →
 * routes.
 */
export function createLearnMoreModule(prisma: PrismaService): DocumentedRouter {
  const repository = new LearnMoreRepository(prisma);
  const service = new LearnMoreService(repository);
  const doc = createDocumentedRouter();
  registerLearnMoreRoutes(doc, service);
  return doc;
}
