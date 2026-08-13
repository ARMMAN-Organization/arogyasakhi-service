import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { EscalationRepository } from './escalation.repository';
import { EscalationService } from './escalation.service';
import { registerEscalationRoutes } from './escalation.routes';

/**
 * Composition root for the escalations feature: wires repository → service → routes.
 */
export function createEscalationModule(prisma: PrismaService): DocumentedRouter {
  const repository = new EscalationRepository(prisma);
  const service = new EscalationService(repository);
  const doc = createDocumentedRouter();
  registerEscalationRoutes(doc, service);
  return doc;
}
