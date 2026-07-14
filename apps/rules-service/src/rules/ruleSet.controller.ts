import { Router } from 'express';
import type { RuleSetService } from './ruleSet.service';
import { createRuleSetSchema } from './dto/create-ruleSet.dto';
import { asyncHandler, ok, validateBody } from '../app.module';

/** Rule set HTTP routes. Mounted under the global `api/v1` prefix. */
export function createRuleSetRouter(service: RuleSetService): Router {
  const router = Router();

  router.get(
    '/rules',
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.post(
    '/rules',
    validateBody(createRuleSetSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
