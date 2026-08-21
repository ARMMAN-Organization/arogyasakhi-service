import { asyncHandler, ok, unauthorized } from '../app.module';
import type { EscalationsBySakhiService } from './escalations-by-sakhi.service';
import {
  parseEscalationTypesParam,
  type EscalationsBySakhiQuery,
} from './dto/get-escalations-by-sakhi.dto';

/**
 * Escalations-by-sakhi request handler. Mounted under the global `api/v1`
 * prefix by `escalations-by-sakhi.routes.ts`.
 */
export function createEscalationsBySakhiController(service: EscalationsBySakhiService) {
  return {
    getEscalationsBySakhi: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());

      const query = req.query as unknown as EscalationsBySakhiQuery;
      const types = parseEscalationTypesParam(query.type);
      const result = await service.getEscalationsBySakhi(
        req.params.sakhiId,
        types,
        req.user,
        authorizationHeader,
      );
      res.json(ok(result));
    }),
  };
}
