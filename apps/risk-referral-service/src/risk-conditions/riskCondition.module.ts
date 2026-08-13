import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { RiskConditionRepository } from './riskCondition.repository';
import { RiskConditionService } from './riskCondition.service';
import { registerRiskConditionRoutes } from './riskCondition.routes';

/**
 * Composition root for the risk-conditions feature: wires repository →
 * service → routes.
 */
export function createRiskConditionModule(prisma: PrismaService): DocumentedRouter {
  const repository = new RiskConditionRepository(prisma);
  const service = new RiskConditionService(repository);
  const doc = createDocumentedRouter();
  registerRiskConditionRoutes(doc, service);
  return doc;
}
