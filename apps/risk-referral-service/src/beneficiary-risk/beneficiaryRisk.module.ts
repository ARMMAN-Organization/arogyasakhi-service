import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { BeneficiaryRiskRepository } from './beneficiaryRisk.repository';
import { BeneficiaryRiskService } from './beneficiaryRisk.service';
import { registerBeneficiaryRiskRoutes } from './beneficiaryRisk.routes';

/**
 * Composition root for the beneficiary-risk feature: wires repository →
 * service → routes.
 */
export function createBeneficiaryRiskModule(prisma: PrismaService): DocumentedRouter {
  const repository = new BeneficiaryRiskRepository(prisma);
  const service = new BeneficiaryRiskService(repository);
  const doc = createDocumentedRouter();
  registerBeneficiaryRiskRoutes(doc, service);
  return doc;
}
