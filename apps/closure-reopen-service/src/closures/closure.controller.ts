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

    getDecisionStatusBatch: asyncHandler(async (req, res) => {
      const ids = String(req.query.ids)
        .split(',')
        .map((id) => id.trim());
      res.json(ok(await service.getDecisionStatusByIds(ids)));
    }),

    getById: asyncHandler(async (req, res) => {
      res.json(ok(await service.getById(req.params.id)));
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

    // Supervisor app's POST alias — translates APPROVE/REJECT to the
    // PATCH endpoint's APPROVED/REJECTED, maps decisionNotes onto
    // supervisorNotes, and delegates to the same service.decide(), so the
    // beneficiary-close/notification behavior is identical regardless of
    // which route a caller uses. decisionReasonCodeLookupId is accepted by
    // the request schema but has no column on Closure to persist into.
    decideAlias: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const updated = await service.decide(
        req.params.id,
        req.user.id,
        {
          decision: req.body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          supervisorNotes: req.body.decisionNotes,
        },
        req.headers.authorization ?? '',
      );
      res.json(ok(updated));
    }),
  };
}
