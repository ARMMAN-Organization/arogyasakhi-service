import { Router } from 'express';
import type { SyncBatchService } from './syncBatch.service';
import { createSyncBatchSchema } from './dto/create-syncBatch.dto';
import { asyncHandler, ok, validateBody } from '../app.module';

/** Sync batch HTTP routes. Mounted under the global `api/v1` prefix. */
export function createSyncBatchRouter(service: SyncBatchService): Router {
  const router = Router();

  router.get(
    '/sync',
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.post(
    '/sync',
    validateBody(createSyncBatchSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
