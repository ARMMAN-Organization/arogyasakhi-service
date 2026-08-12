import { asyncHandler, ok } from '../app.module';
import type { MasterDataService } from './master-data.service';

/**
 * Master-data request handlers. Mounted under the global `api/v1` prefix
 * by `master-data.routes.ts`.
 */
export function createMasterDataController(service: MasterDataService) {
  return {
    getDeltas: asyncHandler(async (req, res) => {
      const { since } = req.query as { since?: string };
      // An empty string means "no since" (client robustness) — normalized
      // here rather than in the Zod schema, since a schema-level
      // transform/pipe crashes zod-to-openapi's doc generation (see the DTO).
      res.json(ok(await service.getDeltas(since || undefined)));
    }),
  };
}
