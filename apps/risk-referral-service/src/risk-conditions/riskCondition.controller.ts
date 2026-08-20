import { asyncHandler, badRequest, ok } from '../app.module';
import type { RiskConditionService } from './riskCondition.service';

/**
 * Risk condition request handlers. Mounted under the global `api/v1`
 * prefix by `riskCondition.routes.ts`.
 */
export function createRiskConditionController(service: RiskConditionService) {
  return {
    list: asyncHandler(async (req, res) => {
      if (req.query.ids && req.query.conditionCode) {
        throw badRequest('Provide either conditionCode or ids, not both.');
      }

      const ids = typeof req.query.ids === 'string' ? req.query.ids.split(',') : undefined;
      if (ids) {
        res.json(ok(await service.listByIds(ids)));
        return;
      }
      const codes =
        typeof req.query.conditionCode === 'string'
          ? req.query.conditionCode.split(',').map((c) => c.trim())
          : undefined;
      res.json(ok(await service.listByConditionCodes(codes)));
    }),
  };
}
