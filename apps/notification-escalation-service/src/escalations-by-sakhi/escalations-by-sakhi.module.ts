import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { EscalationsBySakhiRepository } from './escalations-by-sakhi.repository';
import { EscalationsBySakhiService } from './escalations-by-sakhi.service';
import { registerEscalationsBySakhiRoutes } from './escalations-by-sakhi.routes';

/**
 * Composition root for the escalations-by-sakhi feature: wires repository ->
 * service -> routes.
 */
export function createEscalationsBySakhiModule(prisma: PrismaService): DocumentedRouter {
  const repository = new EscalationsBySakhiRepository(prisma);
  const service = new EscalationsBySakhiService(repository);
  const doc = createDocumentedRouter();
  registerEscalationsBySakhiRoutes(doc, service);
  return doc;
}
