import { asyncHandler, ok } from '../app.module';
import type { BeneficiaryRiskService } from './beneficiaryRisk.service';

/**
 * Beneficiary risk profile request handlers. Mounted under the global
 * `api/v1` prefix by `beneficiaryRisk.routes.ts`.
 */
export function createBeneficiaryRiskController(service: BeneficiaryRiskService) {
  return {
    getRiskProfile: asyncHandler(async (req, res) => {
      const profile = await service.getRiskProfile(req.params.beneficiaryId);
      res.json(ok(profile));
    }),
  };
}
