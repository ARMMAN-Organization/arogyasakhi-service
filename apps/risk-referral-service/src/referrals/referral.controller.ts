import { Router } from 'express';
import type { ReferralService } from './referral.service';
import { createReferralSchema } from './dto/create-referral.dto';
import { asyncHandler, ok, validateBody } from '../app.module';

/** Referral HTTP routes. Mounted under the global `api/v1` prefix. */
export function createReferralRouter(service: ReferralService): Router {
  const router = Router();

  router.get(
    '/referrals',
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.post(
    '/referrals',
    validateBody(createReferralSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
