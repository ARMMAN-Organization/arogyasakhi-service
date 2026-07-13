import { Router } from 'express';
import type { ClosureService } from './closure.service';
import { createClosureSchema } from './dto/create-closure.dto';
import { asyncHandler, ok, validateBody } from '../app.module';

/** Closure HTTP routes. Mounted under the global `api/v1` prefix. */
export function createClosureRouter(service: ClosureService): Router {
  const router = Router();

  router.get(
    '/closures',
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.post(
    '/closures',
    validateBody(createClosureSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
