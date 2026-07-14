import { Router } from 'express';
import type { BeneficiaryService } from './beneficiary.service';
import { createBeneficiarySchema } from './dto/create-beneficiary.dto';
import { asyncHandler, ok, validateBody } from '../app.module';

/** Beneficiary HTTP routes. Mounted under the global `api/v1` prefix. */
export function createBeneficiaryRouter(service: BeneficiaryService): Router {
  const router = Router();

  router.get(
    '/beneficiaries',
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.post(
    '/beneficiaries',
    validateBody(createBeneficiarySchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
