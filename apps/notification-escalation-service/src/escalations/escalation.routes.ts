import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { EscalationService } from './escalation.service';
import { createEscalationController } from './escalation.controller';
import { listEscalationEventsSchema } from './dto/list-escalation-events.dto';
import { createEscalationEventSchema } from './dto/create-escalation-event.dto';
import { acknowledgeEddNearingSchema } from './dto/acknowledge-edd-nearing.dto';
import { decideMissedVisitEscalationSchema } from './dto/decide-missed-visit-escalation.dto';
import { submitClosurePendingReasonSchema } from './dto/submit-closure-pending-reason.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

const escalationEventIdParamsSchema = z
  .object({ id: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }) })
  .strict();

const beneficiaryIdParamsSchema = z.object({ beneficiaryId: z.string().uuid() }).strict();

const activeTransferWindowSchema = z.object({
  active: z.boolean(),
  reviewDeadlineAt: z.string().datetime().nullable(),
});

const escalationCardSchema = z.object({
  cardId: z.string().uuid(),
  cardType: z.enum(['MISSED_VISIT', 'EDD_NEARING']),
  cardSource: z.literal('escalation_events'),
  beneficiaryId: z.string().uuid(),
  visitId: z.string().uuid().nullable(),
  referralId: z.string().uuid().nullable(),
  escalationType: z.string().openapi({ example: 'ANC_2_MISSED' }),
  status: z.string().openapi({ example: 'OPEN' }),
  raisedAt: z.string().datetime(),
});

const listEscalationEventsResponseSchema = z.object({
  cards: z.array(escalationCardSchema),
  nextCursor: z.string().nullable(),
});

// Raw EscalationEvent row shape — distinct from escalationCardSchema above,
// which is the Quick-Response-facing projection. acknowledgeEddNearing/
// decideMissedVisit return the underlying row as decided, not a re-shaped
// card, since a caller deciding directly needs to see the actual persisted
// state (status/resolvedAt/actionTaken), not the card-list projection.
const escalationEventSchema = z.object({
  id: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  visitId: z.string().uuid().nullable(),
  referralId: z.string().uuid().nullable(),
  escalationType: z.string().openapi({ example: 'EDD_NEARING' }),
  status: z.enum([
    'OPEN',
    'ACKNOWLEDGED',
    'TRANSFER_REQUESTED',
    'CLOSE_REQUESTED',
    'RESOLVED',
    'DISMISSED',
  ]),
  assignedSupervisorId: z.string().uuid().nullable(),
  resolvedAt: z.string().datetime().nullable(),
  reviewDeadlineAt: z.string().datetime().nullable(),
  actionTaken: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const missedVisitDetailSchema = z.object({
  id: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  visitsMissedCount: z.number().int().nullable(),
  visitType: z.enum(['ANC', 'PP', 'NN', 'INC', 'INC-HR', 'CCV', 'CCV-HR']),
  requestedAt: z.string().datetime(),
  status: z.enum(['PENDING', 'TRANSFERRED', 'CLOSED']),
});

const eddNearingDetailSchema = z.object({
  id: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  eddDate: z.string().nullable().openapi({ example: '2027-03-01' }),
  reason: z.string().nullable(),
  requestedAt: z.string().datetime(),
  status: z.enum(['PENDING', 'ACKNOWLEDGED']),
});

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  details: z.record(z.unknown()).optional(),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Escalation event HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * This is an internal, service-to-service read surface — approval-service
 * calls it through the gateway (forwarding the caller's own Authorization
 * header, matching supervisor-operations-service's SakhiClient precedent)
 * to merge escalation-sourced Quick Response cards (MISSED_VISIT,
 * EDD_NEARING) alongside its own approval_requests.
 */
export function registerEscalationRoutes(doc: DocumentedRouter, service: EscalationService) {
  const controller = createEscalationController(service);

  doc.get(
    '/escalation-events',
    {
      summary: 'List escalation events shaped as Quick Response cards',
      tags: ['Escalations'],
      responses: {
        200: {
          description: 'Escalation-sourced Quick Response cards',
          schema: envelope(listEscalationEventsResponseSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    validate(listEscalationEventsSchema, 'query'),
    controller.list,
  );

  doc.post(
    '/escalation-events',
    {
      summary: 'Raise a new escalation event',
      tags: ['Escalations'],
      responses: {
        201: { description: 'Escalation event created', schema: envelope(escalationEventSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validateBody(createEscalationEventSchema),
    controller.create,
  );

  doc.get(
    '/escalation-events/:id',
    {
      summary: 'Fetch a single escalation event shaped as a Quick Response card',
      tags: ['Escalations'],
      params: escalationEventIdParamsSchema,
      responses: {
        200: {
          description: 'Escalation-sourced Quick Response card',
          schema: envelope(escalationCardSchema),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Escalation event not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    validate(escalationEventIdParamsSchema, 'params'),
    controller.findById,
  );

  doc.get(
    '/edd-nearing-requests/:id',
    {
      summary:
        "An EDD Nearing card's own detail — the fields Quick Response's generic card " +
        'resolution omits (eddDate, reason). Mirrors /closures/:id, /reopen-requests/:id, ' +
        '/lmp-change-requests/:id.',
      tags: ['Escalations'],
      params: escalationEventIdParamsSchema,
      responses: {
        200: {
          description: 'EDD Nearing request detail',
          schema: envelope(eddNearingDetailSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'EDD Nearing request not found', schema: apiErrorSchema },
        422: { description: 'Not an EDD_NEARING escalation', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    validate(escalationEventIdParamsSchema, 'params'),
    controller.getEddNearingDetail,
  );

  doc.get(
    '/missed-visit-escalations/:id',
    {
      summary:
        "A Missed Visit Escalation card's own detail — the fields Quick Response's generic " +
        'card resolution omits (visitsMissedCount, visitType). Mirrors /closures/:id, ' +
        '/reopen-requests/:id, /lmp-change-requests/:id.',
      tags: ['Escalations'],
      params: escalationEventIdParamsSchema,
      responses: {
        200: {
          description: 'Missed Visit Escalation detail',
          schema: envelope(missedVisitDetailSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Missed Visit Escalation not found', schema: apiErrorSchema },
        422: { description: 'Not a Missed Visit Escalation', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    validate(escalationEventIdParamsSchema, 'params'),
    controller.getMissedVisitDetail,
  );

  doc.post(
    '/edd-nearing-requests/:id/acknowledge',
    {
      summary:
        'Acknowledge an EDD Nearing card — its only decision (FR-SV-4.x). No reason code, ' +
        'no reject path, and per SRS no Sakhi notification. SUPERVISOR-only, matching the ' +
        "Supervisor app's other new decision endpoints — new route with no existing callers " +
        'to preserve compatibility for.',
      tags: ['Escalations'],
      params: escalationEventIdParamsSchema,
      responses: {
        200: {
          description: 'EDD Nearing card acknowledged',
          schema: envelope(escalationEventSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Escalation event not found', schema: apiErrorSchema },
        409: { description: 'Already decided', schema: apiErrorSchema },
        422: { description: 'Not an EDD_NEARING escalation', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR'),
    validate(escalationEventIdParamsSchema, 'params'),
    validateBody(acknowledgeEddNearingSchema),
    controller.acknowledgeEddNearing,
  );

  doc.post(
    '/missed-visit-escalations/:id/decision',
    {
      summary:
        'Decide a Missed Visit Escalation card (FR-SV-4.3). Not an Approve/Reject flow — ' +
        'CLOSE resolves the escalation and notifies the Sakhi to fill the closure form; ' +
        'TRANSFER moves it to TRANSFER_REQUESTED with a 15-day Manager review deadline, then ' +
        "best-effort removes the beneficiary from the Sakhi's list, emails her designated " +
        'Manager, and notifies the Sakhi in-app (see missed-visit-transfer.ts). SUPERVISOR-only, ' +
        "matching the Supervisor app's other new decision endpoints — new route with no " +
        'existing callers to preserve compatibility for.',
      tags: ['Escalations'],
      params: escalationEventIdParamsSchema,
      responses: {
        200: {
          description: 'Missed Visit Escalation decided',
          schema: envelope(escalationEventSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Escalation event not found', schema: apiErrorSchema },
        409: { description: 'Already decided', schema: apiErrorSchema },
        422: { description: 'Not a Missed Visit Escalation', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR'),
    validate(escalationEventIdParamsSchema, 'params'),
    validateBody(decideMissedVisitEscalationSchema),
    controller.decideMissedVisit,
  );

  doc.get(
    '/escalations/beneficiaries/:beneficiaryId/active-transfer-window',
    {
      summary:
        "A beneficiary's active Missed Visit Escalation TRANSFER review window (FR-SV-4.3), " +
        'if any — the most recent TRANSFER_REQUESTED escalation with a still-future ' +
        "reviewDeadlineAt. Intended to be called server-to-server by visit-form-service's " +
        'own SUPERVISOR-only notMetReason gate during the review window — any authenticated ' +
        "role may call it, same low-sensitivity rationale as auth-service's GET /users/:id/name.",
      tags: ['Escalations'],
      params: beneficiaryIdParamsSchema,
      responses: {
        200: {
          description: 'Whether an active transfer window exists for this beneficiary',
          schema: envelope(activeTransferWindowSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        500: { description: 'Server error', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    validate(beneficiaryIdParamsSchema, 'params'),
    controller.getActiveTransferWindow,
  );

  doc.post(
    '/escalations/:id/closure-pending-reason',
    {
      summary:
        "Records why a still-OPEN CLOSURE_PENDING escalation card hasn't had its closure " +
        'form submitted yet (Information not received / App Issues / Beneficiary unavailable / ' +
        "Other, via auth-service's CLOSURE_PENDING_REASON lookup category). Does not change " +
        'status — the closure/decision flow itself is separate. SAKHI-only; ownership is ' +
        "delegated to beneficiary-service's own GET /beneficiaries/:id (SAKHI-own-case check).",
      tags: ['Escalations'],
      params: escalationEventIdParamsSchema,
      responses: {
        200: {
          description: 'Pending reason recorded; escalation status unchanged',
          schema: envelope(escalationEventSchema),
        },
        400: {
          description: 'Validation error, unrecognized reason, or OTHER without notes',
          schema: apiErrorSchema,
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: "Caller role not permitted, or not this beneficiary's own Sakhi",
          schema: apiErrorSchema,
        },
        404: { description: 'Escalation event or beneficiary not found', schema: apiErrorSchema },
        409: { description: 'Escalation is no longer OPEN', schema: apiErrorSchema },
        422: { description: 'Not a CLOSURE_PENDING escalation', schema: apiErrorSchema },
        502: {
          description: 'beneficiary-service or auth-service unreachable',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validate(escalationEventIdParamsSchema, 'params'),
    validateBody(submitClosurePendingReasonSchema),
    controller.submitClosurePendingReason,
  );
}
