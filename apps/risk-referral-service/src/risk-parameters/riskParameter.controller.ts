import { asyncHandler, ok } from '../app.module';
import type { RiskParameterService } from './riskParameter.service';

/**
 * Risk parameter request handlers. Mounted under the global `api/v1`
 * prefix by `riskParameter.routes.ts`.
 */
export function createRiskParameterController(service: RiskParameterService) {
  return {
    listByParameterCodes: asyncHandler(async (req, res) => {
      const codes =
        typeof req.query.parameterCode === 'string'
          ? req.query.parameterCode.split(',').map((c) => c.trim())
          : undefined;
      const found = await service.listByParameterCodes(codes);
      res.json(ok(found));
    }),
  };
}
