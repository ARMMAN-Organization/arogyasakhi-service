import { asyncHandler, ok } from '../app.module';
import type { VisitMasterService } from './visitMaster.service';

/**
 * Visit master request handlers. Mounted under the global `api/v1` prefix
 * by `visitMaster.routes.ts`.
 */
export function createVisitMasterController(service: VisitMasterService) {
  return {
    listByVisitCodes: asyncHandler(async (req, res) => {
      const codes =
        typeof req.query.visitCode === 'string'
          ? req.query.visitCode.split(',').map((c) => c.trim())
          : undefined;
      const found = await service.listByVisitCodes(codes);
      res.json(ok(found));
    }),
  };
}
