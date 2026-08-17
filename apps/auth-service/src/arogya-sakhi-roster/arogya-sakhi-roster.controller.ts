import { asyncHandler, ok, unauthorized } from '../app.module';
import type { ArogyaSakhiRosterService } from './arogya-sakhi-roster.service';
import type { ListArogyaSakhiRosterQuery } from './dto/list-arogya-sakhi-roster.dto';

/**
 * Sakhi roster download request handlers. Mounted under the global `api/v1`
 * prefix by `arogya-sakhi-roster.routes.ts`.
 */
export function createArogyaSakhiRosterController(service: ArogyaSakhiRosterService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const { projectId } = req.query as unknown as ListArogyaSakhiRosterQuery;
      res.json(ok(await service.listByProject(projectId, req.user)));
    }),
  };
}
