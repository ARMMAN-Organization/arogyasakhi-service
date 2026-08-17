import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { RiskParameterRepository } from './riskParameter.repository';
import { RiskParameterService } from './riskParameter.service';
import { registerRiskParameterRoutes } from './riskParameter.routes';

/**
 * Composition root for the risk-parameters feature: wires repository →
 * service → routes.
 */
export function createRiskParameterModule(prisma: PrismaService): DocumentedRouter {
  const repository = new RiskParameterRepository(prisma);
  const service = new RiskParameterService(repository);
  const doc = createDocumentedRouter();
  registerRiskParameterRoutes(doc, service);
  return doc;
}
