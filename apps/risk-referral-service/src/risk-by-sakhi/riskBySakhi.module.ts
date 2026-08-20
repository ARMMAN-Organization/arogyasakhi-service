import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { RiskBySakhiRepository } from './riskBySakhi.repository';
import { RiskBySakhiService } from './riskBySakhi.service';
import { registerRiskBySakhiRoutes } from './riskBySakhi.routes';

/**
 * Composition root for the risk-by-sakhi feature: wires repository →
 * service → routes.
 */
export function createRiskBySakhiModule(prisma: PrismaService): DocumentedRouter {
  const repository = new RiskBySakhiRepository(prisma);
  const service = new RiskBySakhiService(repository);
  const doc = createDocumentedRouter();
  registerRiskBySakhiRoutes(doc, service);
  return doc;
}
