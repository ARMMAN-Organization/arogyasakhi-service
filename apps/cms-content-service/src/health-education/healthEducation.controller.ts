import { asyncHandler, ok } from '../app.module';
import type { HealthEducationService } from './healthEducation.service';

/**
 * Health education message request handlers. Mounted under the global
 * `api/v1` prefix by `healthEducation.routes.ts`.
 */
export function createHealthEducationController(service: HealthEducationService) {
  return {
    listMessages: asyncHandler(async (req, res) => {
      const { riskConditionId, stage } = req.query as { riskConditionId?: string; stage?: string };
      res.json(ok(await service.listMessages({ riskConditionId, stage })));
    }),
  };
}
