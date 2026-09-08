import { asyncHandler, ok, unauthorized } from '../app.module';
import type { AnalyticsEventService } from './analyticsEvent.service';

/**
 * Analytics-event request handlers. Mounted under the global `api/v1`
 * prefix by `analyticsEvent.routes.ts`.
 */
export function createAnalyticsEventController(service: AnalyticsEventService) {
  return {
    createBatch: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const result = await service.createBatch(req.user.id, req.body);
      // 201 even when some events in the batch failed (result.failed is
      // non-empty) — the batch as a whole was accepted and processed; a
      // per-event failure is reported in the body for the caller to inspect
      // and retry just those, not a reason to fail the whole HTTP response.
      res.status(201).json(ok(result));
    }),
  };
}
