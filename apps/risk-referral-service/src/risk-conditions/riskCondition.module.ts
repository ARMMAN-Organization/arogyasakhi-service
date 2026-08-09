import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { RiskConditionRepository } from './riskCondition.repository';
import { RiskConditionService } from './riskCondition.service';
import { createRiskConditionRouter } from './riskCondition.controller';

/**
 * Composition root for the risk-conditions feature: wires repository →
 * service → router.
 */
export function createRiskConditionModule(prisma: PrismaService): DocumentedRouter {
  const repository = new RiskConditionRepository(prisma);
  const service = new RiskConditionService(repository);
  return createRiskConditionRouter(service);
}
