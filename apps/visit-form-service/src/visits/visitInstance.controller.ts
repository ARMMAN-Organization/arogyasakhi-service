import { Router } from 'express';
import type { VisitInstanceService } from './visitInstance.service';
import { createVisitInstanceSchema } from './dto/create-visitInstance.dto';
import { asyncHandler, ok, validateBody } from '../app.module';

/** Visit instance HTTP routes. Mounted under the global `api/v1` prefix. */
export function createVisitInstanceRouter(service: VisitInstanceService): Router {
  const router = Router();

  router.get(
    '/visits',
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.post(
    '/visits',
    validateBody(createVisitInstanceSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
