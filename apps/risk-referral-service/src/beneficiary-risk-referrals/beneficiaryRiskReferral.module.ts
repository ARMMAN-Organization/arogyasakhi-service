import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { BeneficiaryRiskReferralRepository } from './beneficiaryRiskReferral.repository';
import { BeneficiaryRiskReferralService } from './beneficiaryRiskReferral.service';
import { registerBeneficiaryRiskReferralRoutes } from './beneficiaryRiskReferral.routes';

/**
 * Composition root for the beneficiary-risk-referrals feature: wires
 * repository → service → routes.
 */
export function createBeneficiaryRiskReferralModule(prisma: PrismaService): DocumentedRouter {
  const repository = new BeneficiaryRiskReferralRepository(prisma);
  const service = new BeneficiaryRiskReferralService(repository);
  const doc = createDocumentedRouter();
  registerBeneficiaryRiskReferralRoutes(doc, service);
  return doc;
}
