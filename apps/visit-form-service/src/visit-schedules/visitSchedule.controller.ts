import { asyncHandler, ok, unauthorized } from '../app.module';
import type { VisitScheduleService } from './visitSchedule.service';

/**
 * Visit schedule request handlers. Mounted under the global `api/v1`
 * prefix by `visitSchedule.routes.ts`.
 */
export function createVisitScheduleController(service: VisitScheduleService) {
  return {
    createBulk: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization') ?? '';
      const result = await service.createBulk(req.body, req.user, authorizationHeader);
      res.status(201).json(ok(result));
    }),
  };
}
