import { notFound } from '@armman/service-commons';
import { asyncHandler, ok, unauthorized } from '../app.module';
import type { EscalationService } from './escalation.service';
import type { ListEscalationEventsInput } from './dto/list-escalation-events.dto';
import type { CreateEscalationEventInput } from './dto/create-escalation-event.dto';
import type { DecideMissedVisitEscalationInput } from './dto/decide-missed-visit-escalation.dto';
import type { SubmitClosurePendingReasonInput } from './dto/submit-closure-pending-reason.dto';

/**
 * Escalation event request handlers. Mounted under the global `api/v1`
 * prefix by `escalation.routes.ts`.
 */
export function createEscalationController(service: EscalationService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = req.query as unknown as ListEscalationEventsInput;
      res.json(ok(await service.list(query, req.user, authorizationHeader)));
    }),

    create: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const body = req.body as CreateEscalationEventInput;
      const { event, wasCreated } = await service.create(body, req.user.id);
      res.status(201).json(ok({ ...event, wasCreated }));
    }),

    findById: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const card = await service.findById(req.params.id, req.user, authorizationHeader);
      if (!card) throw notFound('Escalation event not found.');
      res.json(ok(card));
    }),

    getMissedVisitDetail: asyncHandler(async (req, res) => {
      res.json(ok(await service.getMissedVisitDetail(req.params.id)));
    }),

    getEddNearingDetail: asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(ok(await service.getEddNearingDetail(req.params.id, authorizationHeader)));
    }),

    acknowledgeEddNearing: asyncHandler(async (req, res) => {
      res.json(ok(await service.acknowledgeEddNearing(req.params.id)));
    }),

    decideMissedVisit: asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { action } = req.body as DecideMissedVisitEscalationInput;
      res.json(ok(await service.decideMissedVisit(req.params.id, action, authorizationHeader)));
    }),

    getActiveTransferWindow: asyncHandler(async (req, res) => {
      res.json(ok(await service.getActiveTransferWindow(req.params.beneficiaryId)));
    }),

    submitClosurePendingReason: asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const body = req.body as SubmitClosurePendingReasonInput;
      res.json(
        ok(await service.submitClosurePendingReason(req.params.id, body, authorizationHeader)),
      );
    }),
  };
}
