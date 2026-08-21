import { asyncHandler, ok, unauthorized } from '../app.module';
import type { OperationsService } from './operations.service';
import type { VisitSummaryBySakhiQueryInput } from './dto/visit-summary-by-sakhi-query.dto';

/**
 * Visit-summary-by-sakhi request handler. Mounted under the global `api/v1`
 * prefix by `visitSummary.routes.ts`.
 */
export function createVisitSummaryController(service: OperationsService) {
  return {
    getBySakhi: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = req.query as unknown as VisitSummaryBySakhiQueryInput;
      res.json(
        ok(await service.getVisitSummaryBySakhi(req.params.sakhiId, query, authorizationHeader)),
      );
    }),
  };
}
