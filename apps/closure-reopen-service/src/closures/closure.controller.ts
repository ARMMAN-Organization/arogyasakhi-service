import { asyncHandler, ok, unauthorized } from '../app.module';
import type { ClosureService } from './closure.service';

/**
 * Closure request handlers. Mounted under the global `api/v1` prefix by
 * `closure.routes.ts`.
 */
export function createClosureController(service: ClosureService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),

    create: asyncHandler(async (req, res) => {
      const created = await service.create(req.body, req.headers.authorization ?? '');
      res.status(201).json(ok(created));
    }),

    decide: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const updated = await service.decide(
        req.params.id,
        req.user.id,
        req.body,
        req.headers.authorization ?? '',
      );
      res.json(ok(updated));
    }),
  };
}
