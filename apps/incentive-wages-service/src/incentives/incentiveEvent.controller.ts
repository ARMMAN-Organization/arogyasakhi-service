import { Router } from 'express';
import type { IncentiveEventService } from './incentiveEvent.service';
import { createIncentiveEventSchema } from './dto/create-incentiveEvent.dto';
import { asyncHandler, ok, validateBody } from '../app.module';

/** Incentive event HTTP routes. Mounted under the global `api/v1` prefix. */
export function createIncentiveEventRouter(service: IncentiveEventService): Router {
  const router = Router();

  router.get(
    '/incentives',
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.post(
    '/incentives',
    validateBody(createIncentiveEventSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
