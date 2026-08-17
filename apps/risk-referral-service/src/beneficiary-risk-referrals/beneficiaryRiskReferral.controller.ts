import { asyncHandler, ok } from '../app.module';
import type { BeneficiaryRiskReferralService } from './beneficiaryRiskReferral.service';

/**
 * Beneficiary risk-referral request handlers. Mounted under the global
 * `api/v1` prefix by `beneficiaryRiskReferral.routes.ts`.
 */
export function createBeneficiaryRiskReferralController(service: BeneficiaryRiskReferralService) {
  return {
    listReferrals: asyncHandler(async (req, res) => {
      const referrals = await service.listReferrals(req.params.beneficiaryId);
      res.json(ok(referrals));
    }),

    getReferralDetails: asyncHandler(async (req, res) => {
      const details = await service.getReferralDetails(
        req.params.beneficiaryId,
        req.params.referralId,
      );
      res.json(ok(details));
    }),
  };
}
