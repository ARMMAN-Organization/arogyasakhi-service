import { asyncHandler, ok, unauthorized } from '../app.module';
import type { SakhiService } from './sakhi.service';
import { parseIdsParam } from './dto/by-ids-query.dto';

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

    getById: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getById(req.params.sakhiId, req.user)));
    }),

    getManyByIds: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const ids = parseIdsParam(req.query.ids as string);
      res.json(ok(await service.getManyByIds(ids, req.user)));
    }),
  };
}
