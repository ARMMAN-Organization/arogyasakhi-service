import { asyncHandler, ok } from '../app.module';
import type { RuleSetService } from './ruleSet.service';

/**
 * Rule set request handlers. Mounted under the global `api/v1` prefix by
 * `ruleSet.routes.ts`.
 */
export function createRuleSetController(service: RuleSetService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),

    create: asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  };
}
