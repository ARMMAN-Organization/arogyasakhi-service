import { asyncHandler, ok, unauthorized } from '../app.module';
import type { SakhiService } from './sakhi.service';
import { parseIdsParam, type byIdsQuerySchema } from './dto/by-ids-query.dto';
import type { z } from 'zod';

/**
 * Sakhi profile request handlers. Mounted under the global `api/v1` prefix
 * by `sakhi.routes.ts`.
 */
export function createSakhiController(service: SakhiService) {
  return {
    listByProject: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.listByProject(req.params.projectId, req.user)));
    }),

    getByIds: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const query = req.query as unknown as z.infer<typeof byIdsQuerySchema>;
      const ids = parseIdsParam(query.ids);
      res.json(ok(await service.getByIds(ids, req.user)));
    }),

    getById: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getById(req.params.sakhiId, req.user)));
    }),
  };
}
