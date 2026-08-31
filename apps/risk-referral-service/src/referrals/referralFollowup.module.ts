import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { ReferralRepository } from './referral.repository';
import { ReferralFollowupRepository } from './referralFollowup.repository';
import { ReferralFollowupService } from './referralFollowup.service';
import { createReferralFollowupRouter } from './referralFollowup.controller';
import { BeneficiaryClient } from './beneficiary.client';

/**
 * Composition root for the referral follow-up feature: wires repository ->
 * service -> router. A separate module from referral.module.ts (its own
 * createReferralModule), following this repo's one-module-per-feature
 * convention — not folded into the same module, even though both features
 * live in the same `referrals/` folder.
 */
export function createReferralFollowupModule(prisma: PrismaService): DocumentedRouter {
  const referralRepository = new ReferralRepository(prisma);
  const followupRepository = new ReferralFollowupRepository(prisma);
  const beneficiaryClient = new BeneficiaryClient();
  const service = new ReferralFollowupService(
    followupRepository,
    referralRepository,
    beneficiaryClient,
  );
  return createReferralFollowupRouter(service);
}
