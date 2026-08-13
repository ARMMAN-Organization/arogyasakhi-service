import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { RiskAssessmentRepository } from './riskAssessment.repository';
import { RiskAssessmentService } from './riskAssessment.service';
import { registerRiskAssessmentRoutes } from './riskAssessment.routes';

/**
 * Composition root for the risk-assessments feature: wires repository →
 * service → routes.
 */
export function createRiskAssessmentModule(prisma: PrismaService): DocumentedRouter {
  const repository = new RiskAssessmentRepository(prisma);
  const service = new RiskAssessmentService(repository);
  const doc = createDocumentedRouter();
  registerRiskAssessmentRoutes(doc, service);
  return doc;
}
