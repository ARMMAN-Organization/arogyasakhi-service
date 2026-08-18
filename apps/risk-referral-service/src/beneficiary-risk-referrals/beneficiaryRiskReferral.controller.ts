import { asyncHandler, ok, unauthorized } from '../app.module';
import type { BeneficiaryRiskReferralService } from './beneficiaryRiskReferral.service';

/**
 * Beneficiary risk-referral request handlers. Mounted under the global
 * `api/v1` prefix by `beneficiaryRiskReferral.routes.ts`.
 */
export function createBeneficiaryRiskReferralController(service: BeneficiaryRiskReferralService) {
  return {
    listReferrals: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const referrals = await service.listReferrals(
        req.params.beneficiaryId,
        req.user,
        authorizationHeader,
      );
      res.json(ok(referrals));
    }),

    getReferralDetails: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const details = await service.getReferralDetails(
        req.params.beneficiaryId,
        req.params.referralId,
        req.user,
        authorizationHeader,
      );
      res.json(ok(details));
    }),
  };
}
