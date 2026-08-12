import { asyncHandler, ok } from '../app.module';
import type { SyncBatchService } from './syncBatch.service';

/**
 * Sync batch request handlers. Mounted under the global `api/v1` prefix by
 * `syncBatch.routes.ts`.
 */
export function createSyncBatchController(service: SyncBatchService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),

    create: asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  };
}
