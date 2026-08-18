import { asyncHandler, notFound, ok } from '../app.module';
import type { IncentiveRateService } from './incentiveRate.service';

/**
 * Incentive rate request handlers. Mounted under the global `api/v1` prefix
 * by `incentiveRate.routes.ts`.
 */
export function createIncentiveRateController(service: IncentiveRateService) {
  return {
    listAll: asyncHandler(async (_req, res) => {
      res.json(ok(await service.findAll()));
    }),

    findActive: asyncHandler(async (req, res) => {
      const rate = await service.findActive(req.query as never);
      if (!rate) throw notFound('No active incentive rate found.');
      res.json(ok(rate));
    }),
  };
}
