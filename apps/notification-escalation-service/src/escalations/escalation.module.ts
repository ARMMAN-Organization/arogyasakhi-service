import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { EscalationRepository } from './escalation.repository';
import { EscalationService } from './escalation.service';
import { createEscalationRouter } from './escalation.controller';

/**
 * Composition root for the escalations feature: wires repository → service → router.
 */
export function createEscalationModule(prisma: PrismaService): DocumentedRouter {
  const repository = new EscalationRepository(prisma);
  const service = new EscalationService(repository);
  return createEscalationRouter(service);
}
