import { asyncHandler, ok, unauthorized } from '../app.module';
import type { RuleVersionService } from './ruleVersion.service';

/**
 * Rule version request handlers. Mounted under the global `api/v1` prefix
 * by `ruleVersion.routes.ts`.
 */
export function createRuleVersionController(service: RuleVersionService) {
  return {
    getById: asyncHandler(async (req, res) => {
      res.json(ok(await service.getById(req.params.versionId)));
    }),

    getPublished: asyncHandler(async (req, res) => {
      res.json(ok(await service.getPublished(req.params.setId)));
    }),

    publish: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const published = await service.publish(req.params.setId, req.body, req.user.id);
      res.status(201).json(ok(published));
    }),

    evaluate: asyncHandler(async (req, res) => {
      res.json(ok(await service.evaluate(req.params.setId, req.body)));
    }),

    evaluateSchedule: asyncHandler(async (req, res) => {
      res.json(ok(await service.evaluateSchedule(req.params.setId, req.body)));
    }),
  };
}
