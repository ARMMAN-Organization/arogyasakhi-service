import { asyncHandler, ok, unauthorized } from '../app.module';
import type { RiskBySakhiService } from './riskBySakhi.service';

/**
 * Risk-by-sakhi request handlers. Mounted under the global `api/v1` prefix
 * by `riskBySakhi.routes.ts`.
 */
export function createRiskBySakhiController(service: RiskBySakhiService) {
  return {
    getRiskBySakhi: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());

      const type =
        req.query.type === 'ANC' || req.query.type === 'PNC' ? req.query.type : undefined;
      const result = await service.getRiskBySakhi(
        req.params.sakhiId,
        type,
        req.user,
        authorizationHeader,
      );
      res.json(ok(result));
    }),
  };
}
