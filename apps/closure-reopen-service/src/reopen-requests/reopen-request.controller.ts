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

    getDecisionStatusBatch: asyncHandler(async (req, res) => {
      const ids = String(req.query.ids)
        .split(',')
        .map((id) => id.trim());
      res.json(ok(await service.getDecisionStatusByIds(ids)));
    }),

    getById: asyncHandler(async (req, res) => {
      res.json(ok(await service.getById(req.params.id)));
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

    // Supervisor app's POST alias — translates APPROVE/REJECT to the
    // PATCH endpoint's APPROVED/REJECTED and delegates to the same
    // service.decide(), so the audit/notification/reactivation behavior
    // is identical regardless of which route a caller uses.
    decideAlias: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const updated = await service.decide(
        req.params.id,
        req.user.id,
        {
          decision: req.body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
          decisionReasonCodeLookupId: req.body.decisionReasonCodeLookupId,
          decisionNotes: req.body.decisionNotes,
        },
        req.headers.authorization ?? '',
      );
      res.json(ok(updated));
    }),
  };
}
