import { asyncHandler, ok } from '../app.module';
import type { RiskConditionService } from './riskCondition.service';

/**
 * Risk condition request handlers. Mounted under the global `api/v1`
 * prefix by `riskCondition.routes.ts`.
 */
export function createRiskConditionController(service: RiskConditionService) {
  return {
    listByConditionCodes: asyncHandler(async (req, res) => {
      const codes =
        typeof req.query.conditionCode === 'string'
          ? req.query.conditionCode.split(',').map((c) => c.trim())
          : undefined;
      const found = await service.listByConditionCodes(codes);
      res.json(ok(found));
    }),
  };
}
