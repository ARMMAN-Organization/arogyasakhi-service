import { asyncHandler, ok, unauthorized } from '../app.module';
import type { ReopenRequestService } from './reopen-request.service';

/**
 * Reopen request handlers. Mounted under the global `api/v1` prefix by
 * `reopen-request.routes.ts`.
 */
export function createReopenRequestController(service: ReopenRequestService) {
  return {
    listByBeneficiaryId: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const results = await service.listByBeneficiaryId(
        req.query.beneficiaryId as string,
        req.headers.authorization ?? '',
      );
      res.json(ok(results));
    }),

    create: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.create(req.body, req.user.id, req.headers.authorization ?? '');
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
