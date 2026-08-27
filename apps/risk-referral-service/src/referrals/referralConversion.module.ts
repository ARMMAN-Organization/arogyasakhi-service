import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { ReferralRepository } from './referral.repository';
import { ReferralConversionService } from './referralConversion.service';
import { createReferralConversionRouter } from './referralConversion.controller';
import { BeneficiaryClient } from './beneficiary.client';

/**
 * Composition root for the referral conversion feature: wires repository ->
 * service -> router. A separate module from referral.module.ts, matching
 * the same one-module-per-feature convention referralFollowup.module.ts
 * already established.
 */
export function createReferralConversionModule(prisma: PrismaService): DocumentedRouter {
  const referralRepository = new ReferralRepository(prisma);
  const beneficiaryClient = new BeneficiaryClient();
  const service = new ReferralConversionService(referralRepository, beneficiaryClient);
  return createReferralConversionRouter(service);
}
