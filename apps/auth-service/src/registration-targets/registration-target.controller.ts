import { asyncHandler, ok, unauthorized } from '../app.module';
import type { RegistrationTargetService } from './registration-target.service';
import type { ListRegistrationTargetsQuery } from './dto/list-registration-targets.dto';

/**
 * Sakhi registration target request handlers. Mounted under the global
 * `api/v1` prefix by `registration-target.routes.ts`.
 */
export function createRegistrationTargetController(service: RegistrationTargetService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const { sakhiId } = req.query as unknown as ListRegistrationTargetsQuery;
      res.json(ok(await service.list(sakhiId, req.user)));
    }),
  };
}
