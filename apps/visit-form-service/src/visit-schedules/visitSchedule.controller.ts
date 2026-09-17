import type { z } from 'zod';
import { asyncHandler, ok, unauthorized } from '../app.module';
import type { VisitScheduleService } from './visitSchedule.service';
import type { listVisitSchedulesQuerySchema } from './dto/list-visit-schedules.dto';

/**
 * Visit schedule request handlers. Mounted under the global `api/v1`
 * prefix by `visitSchedule.routes.ts`.
 */
export function createVisitScheduleController(service: VisitScheduleService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = req.query as unknown as z.infer<typeof listVisitSchedulesQuerySchema>;
      res.json(ok(await service.list(query, authorizationHeader)));
    }),

    createBulk: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization') ?? '';
      const result = await service.createBulk(req.body, req.user, authorizationHeader);
      res.status(201).json(ok(result));
    }),

    generate: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization') ?? '';
      const result = await service.generateSchedule(req.body, req.user, authorizationHeader);
      res.status(201).json(ok(result));
    }),
  };
}
