import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { ReopenRequestService } from './reopen-request.service';
import { createReopenRequestController } from './reopen-request.controller';
import { createReopenRequestSchema } from './dto/create-reopen-request.dto';
import { decideReopenRequestSchema } from './dto/decide-reopen-request.dto';
import { decideReopenRequestAliasSchema } from './dto/decide-reopen-request-alias.dto';
import { decisionStatusQuerySchema } from './dto/decision-status-query.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

const reopenRequestIdParamsSchema = z
  .object({ id: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }) })
  .strict();

const listByBeneficiaryQuerySchema = z
  .object({
    beneficiaryId: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
  })
  .strict();

const decideReopenRequestRequestSchema = decideReopenRequestSchema.extend({
  decision: decideReopenRequestSchema.shape.decision.openapi({ example: 'APPROVED' }),
});

const decideReopenRequestAliasRequestSchema = decideReopenRequestAliasSchema.extend({
  decision: decideReopenRequestAliasSchema.shape.decision.openapi({ example: 'APPROVE' }),
});

// Fields mirror `model ReopenRequest` in prisma/schema.prisma exactly — no
// invented fields — for accurate Swagger documentation only.
const reopenRequestSchema = z.object({
  id: z.string().uuid(),
  localReopenRequestUuid: z.string(),
  beneficiaryId: z.string().uuid(),
  requestReason: z.enum(['MIGRATION_RETURNED', 'CLOSED_BY_MISTAKE', 'OTHER']),
  requestedByUserId: z.string().uuid(),
  requestedAt: z.string().datetime(),
  supervisorStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
  decisionReasonCodeLookupId: z.string().uuid().nullable(),
  decisionNotes: z.string().nullable(),
  decidedByUserId: z.string().uuid().nullable(),
  decidedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  details: z.record(z.unknown()).optional(),
});

const decisionStatusRowSchema = z.object({
  id: z.string().uuid(),
  supervisorStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Reopen request HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Wider than Quick Response's own SUPERVISOR-only decision endpoint —
 * SUPERVISOR/MANAGER/ADMIN matches this service's existing route convention
 * (see closure.routes.ts's GET /closures). approval-service's
 * POST /quick-response/:cardId/decision stays SUPERVISOR-only at its own
 * layer; this endpoint isn't artificially narrower than its siblings.
 *
 * The audit_log entry and Sakhi notification are written here, in
 * `ReopenRequestService.decide`, not by callers — so they happen
 * regardless of whether this endpoint is reached via Quick Response or
 * called directly.
 */
export function registerReopenRequestRoutes(doc: DocumentedRouter, service: ReopenRequestService) {
  const controller = createReopenRequestController(service);

  doc.get(
    '/reopen-requests',
    {
      summary:
        "A beneficiary's reopen-request history, most-recent first — lets the app show " +
        '"Reopen pending review" (any entry with supervisorStatus: \'PENDING\') instead of ' +
        'just "Closed" while a request is mid-flow, since currentStatus alone stays CLOSED ' +
        'for the entire pending window. Ownership scoping is delegated to ' +
        "beneficiary-service's own GET /beneficiaries/:id (SAKHI-own-case / SUPERVISOR-roster " +
        '/ MANAGER-unrestricted) — a beneficiaryId the caller cannot access 403s/404s the same ' +
        'way that lookup would.',
      tags: ['Reopen Requests'],
      query: listByBeneficiaryQuerySchema,
      responses: {
        200: {
          description: "Beneficiary's reopen requests (empty array if none)",
          schema: envelope(z.array(reopenRequestSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: 'Caller role not permitted, or outside their own roster/case',
          schema: apiErrorSchema,
        },
        404: { description: 'Beneficiary not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    validate(listByBeneficiaryQuerySchema, 'query'),
    controller.listByBeneficiaryId,
  );

  doc.get(
    '/reopen-requests/decision-status',
    {
      summary:
        'Real-time supervisorStatus for a batch of reopen request ids — internal use only, ' +
        "not part of the public Reopen Requests API surface. Lets Quick Response's list() " +
        "reconcile against the reopen request's actual current decision state instead of " +
        "trusting approval_requests' own cached copy, since a reopen request can be decided " +
        'directly via PATCH/POST /reopen-requests/:id/decision, bypassing approval-service ' +
        'entirely. An id not found or soft-deleted is simply omitted from the result, not an ' +
        'error.',
      tags: ['Reopen Requests'],
      query: decisionStatusQuerySchema,
      responses: {
        200: {
          description: 'Reopen request decision statuses for the requested ids',
          schema: envelope(z.array(decisionStatusRowSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(decisionStatusQuerySchema, 'query'),
    controller.getDecisionStatusBatch,
  );

  doc.get(
    '/reopen-requests/:id',
    {
      summary:
        "A single reopen request's full detail — added for Quick Response's card-" +
        'enrichment endpoint (approval-service resolves REOPEN cards through this), not a ' +
        'general SAKHI-facing read; the app has no existing single-record-read flow for ' +
        'this resource.',
      tags: ['Reopen Requests'],
      params: reopenRequestIdParamsSchema,
      responses: {
        200: { description: 'Reopen request detail', schema: envelope(reopenRequestSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Reopen request not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(reopenRequestIdParamsSchema, 'params'),
    controller.getById,
  );

  doc.post(
    '/reopen-requests',
    {
      summary: 'Raise a reopen request for a closed beneficiary (FR-S-10.3)',
      tags: ['Reopen Requests'],
      responses: {
        201: { description: 'Reopen request created', schema: envelope(reopenRequestSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validateBody(createReopenRequestSchema),
    controller.create,
  );

  doc.patch(
    '/reopen-requests/:id/decision',
    {
      summary: 'Decide a Supervisor-reviewed reopen request (approve/reject)',
      tags: ['Reopen Requests'],
      params: reopenRequestIdParamsSchema,
      responses: {
        200: { description: 'Reopen request decided', schema: envelope(reopenRequestSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Reopen request not found', schema: apiErrorSchema },
        409: { description: 'Already decided', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(reopenRequestIdParamsSchema, 'params'),
    validateBody(decideReopenRequestRequestSchema),
    controller.decide,
  );

  doc.post(
    '/reopen-requests/:id/decision',
    {
      summary:
        'Decide a Supervisor-reviewed reopen request — Supervisor app alias (POST, ' +
        'APPROVE/REJECT) of the PATCH endpoint above. SUPERVISOR-only, narrower than the ' +
        "PATCH endpoint's SUPERVISOR/MANAGER/ADMIN, since this is a new route with no " +
        'existing callers to preserve compatibility for.',
      tags: ['Reopen Requests'],
      params: reopenRequestIdParamsSchema,
      responses: {
        200: { description: 'Reopen request decided', schema: envelope(reopenRequestSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Reopen request not found', schema: apiErrorSchema },
        409: { description: 'Already decided', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR'),
    validate(reopenRequestIdParamsSchema, 'params'),
    validateBody(decideReopenRequestAliasRequestSchema),
    controller.decideAlias,
  );
}
