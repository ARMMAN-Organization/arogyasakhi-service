import { asyncHandler, ok } from '../app.module';
import type { HealthEducationService } from './healthEducation.service';

/**
 * Health education message request handlers. Mounted under the global
 * `api/v1` prefix by `healthEducation.routes.ts`.
 */
export function createHealthEducationController(service: HealthEducationService) {
  return {
    listMessages: asyncHandler(async (req, res) => {
      // conditionLabel was missing here even though the route schema
      // (listMessagesQuerySchema) accepts it and the repository fully
      // supports it — every conditionLabel-filtered call silently fell
      // through to "no filter" and returned all messages across every
      // condition. Found live: risk-referral-service's
      // resolveHealthEducationMessages (the only real caller of this
      // filter today) got all 32 seeded rows back for every risk-graded
      // condition instead of the 1-4 that actually match.
      const { riskConditionId, stage, conditionLabel } = req.query as {
        riskConditionId?: string;
        stage?: string;
        conditionLabel?: string;
      };
      res.json(ok(await service.listMessages({ riskConditionId, stage, conditionLabel })));
    }),
  };
}
