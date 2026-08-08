import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { RiskAssessmentRepository } from './riskAssessment.repository';
import { RiskAssessmentService } from './riskAssessment.service';
import { createRiskAssessmentRouter } from './riskAssessment.controller';

/**
 * Composition root for the risk-assessments feature: wires repository →
 * service → router.
 */
export function createRiskAssessmentModule(prisma: PrismaService): DocumentedRouter {
  const repository = new RiskAssessmentRepository(prisma);
  const service = new RiskAssessmentService(repository);
  return createRiskAssessmentRouter(service);
}
