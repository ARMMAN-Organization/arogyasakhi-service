import { Router } from 'express';
import type { SessionService } from './session.service';
import { createSessionSchema } from './dto/create-session.dto';
import { asyncHandler, ok, validateBody } from '../app.module';

/** Session HTTP routes. Mounted under the global `api/v1` prefix. */
export function createSessionRouter(service: SessionService): Router {
  const router = Router();

  router.get(
    '/sessions',
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.post(
    '/sessions',
    validateBody(createSessionSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
