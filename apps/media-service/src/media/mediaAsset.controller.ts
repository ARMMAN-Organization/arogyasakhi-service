import { Router } from 'express';
import type { MediaAssetService } from './mediaAsset.service';
import { createMediaAssetSchema } from './dto/create-mediaAsset.dto';
import { asyncHandler, ok, validateBody } from '../app.module';

/** Media asset HTTP routes. Mounted under the global `api/v1` prefix. */
export function createMediaAssetRouter(service: MediaAssetService): Router {
  const router = Router();

  router.get(
    '/media',
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.post(
    '/media',
    validateBody(createMediaAssetSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
