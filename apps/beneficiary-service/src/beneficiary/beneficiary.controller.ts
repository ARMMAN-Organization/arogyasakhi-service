import { Router } from 'express';
import { z } from 'zod';
import type { BeneficiaryService } from './beneficiary.service';
import { createBeneficiarySchema } from './dto/create-beneficiary.dto';
import {
  asyncHandler,
  ok,
  requireRoles,
  trustGatewayIdentity,
  unauthorized,
  validate,
  validateBody,
} from '../app.module';

const idParamsSchema = z.object({ id: z.string().uuid() }).strict();

/**
 * Beneficiary HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * `trustGatewayIdentity` populates `req.user` from the headers the API
 * Gateway set after verifying the caller's JWT (see the HLD §3.1 Step 2) —
 * this service does not re-verify the token itself, only checks the role.
 * Required roles per the HLD §4.1 endpoint table.
 */
export function createBeneficiaryRouter(service: BeneficiaryService): Router {
  const router = Router();

  router.get(
    '/beneficiaries',
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.get(
    '/beneficiaries/:id',
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    validate(idParamsSchema, 'params'),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.getById(req.params.id)));
    }),
  );

  router.post(
    '/beneficiaries',
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validateBody(createBeneficiarySchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.create(req.body, req.user.id);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
