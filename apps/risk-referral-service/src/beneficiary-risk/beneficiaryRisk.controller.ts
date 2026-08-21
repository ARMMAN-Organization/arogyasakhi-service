import { asyncHandler, ok, unauthorized } from '../app.module';
import type { BeneficiaryRiskService } from './beneficiaryRisk.service';

/**
 * Beneficiary risk profile request handlers. Mounted under the global
 * `api/v1` prefix by `beneficiaryRisk.routes.ts`.
 */
export function createBeneficiaryRiskController(service: BeneficiaryRiskService) {
  return {
    getRiskProfile: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const profile = await service.getRiskProfile(
        req.params.beneficiaryId,
        req.user,
        authorizationHeader,
      );
      res.json(ok(profile));
    }),

    getRiskState: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const state = await service.getRiskState(
        req.params.beneficiaryId,
        req.user,
        authorizationHeader,
      );
      res.json(ok(state));
    }),
  };
}
