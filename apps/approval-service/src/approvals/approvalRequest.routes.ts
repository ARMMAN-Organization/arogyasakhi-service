import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { ApprovalRequestService } from './approvalRequest.service';
import { createApprovalRequestController } from './approvalRequest.controller';
import { createApprovalRequestSchema } from './dto/create-approvalRequest.dto';
import { getApprovalBySourceSchema } from './dto/get-approval-by-source.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

// Request DTO annotated with examples for Swagger UI; validation behavior is
// unchanged (`.openapi()` only attaches documentation metadata).
// requestPayloadJson/decisionPayloadJson are built on z.lazy() (see
// create-approvalRequest.dto.ts) — zod-to-openapi cannot introspect z.lazy()
// on its own, so `type: 'object'` is required here to short-circuit its type
// inference.
const createApprovalRequestRequestSchema = createApprovalRequestSchema.extend({
  requestPayloadJson: createApprovalRequestSchema.shape.requestPayloadJson.openapi({
    type: 'object',
    example: {},
  }),
  decisionPayloadJson: createApprovalRequestSchema.shape.decisionPayloadJson.openapi({
    type: 'object',
    example: {},
  }),
});

const approvalRequestSchema = z.object({
  id: z.string().uuid(),
  requestType: z.enum([
    'LMP_CHANGE',
    'REFERRAL_INCOMPLETE',
    'ACCOMPANIED_REFERRAL',
    'CLOSURE_REVIEW',
    'REOPEN',
    'DATA_RESTORE',
    'TRANSFER',
  ]),
  beneficiaryId: z.string().uuid().nullable(),
  sourceEntityType: z.string().openapi({ example: 'BeneficiaryCase' }),
  sourceEntityId: z.string().uuid(),
  sourceSubmissionId: z.string().uuid().nullable(),
  decisionReasonCodeLookupId: z.string().uuid().nullable(),
  decisionNotes: z.string().nullable(),
  decidedByUserId: z.string().uuid().nullable(),
  sourceAnswerId: z.string().uuid().nullable(),
  referralId: z.string().uuid().nullable(),
  closureId: z.string().uuid().nullable(),
  reopenRequestId: z.string().uuid().nullable(),
  requestedByUserId: z.string().uuid(),
  approverUserId: z.string().uuid().nullable(),
  requestPayloadJson: z.unknown().nullable(),
  decisionStatusLookupId: z.string().uuid(),
  decisionPayloadJson: z.unknown().nullable(),
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

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Approval request HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body schema
 * is inferred from `validateBody` already in the middleware chain, so
 * `/docs.json` can never drift from what's actually mounted.
 */
export function registerApprovalRequestRoutes(
  doc: DocumentedRouter,
  service: ApprovalRequestService,
) {
  const controller = createApprovalRequestController(service);

  doc.get(
    '/approvals',
    {
      summary: 'List the most recent approval requests',
      tags: ['Approvals'],
      responses: {
        200: {
          description: 'Approval requests',
          schema: envelope(z.array(approvalRequestSchema)),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    controller.list,
  );

  doc.get(
    '/approvals/by-source',
    {
      summary:
        'Resolve the approval_requests row raised for a closure or reopen request — used by ' +
        "closure-reopen-service to recover the id it needs (this endpoint's response `id`) to " +
        'link a Closure Review/Reopen decision notification to its Quick Response card. Provide ' +
        'exactly one of closureId or reopenRequestId.',
      tags: ['Approvals'],
      responses: {
        200: { description: 'Matching approval request', schema: envelope(approvalRequestSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'No matching approval request', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER'),
    validate(getApprovalBySourceSchema, 'query'),
    controller.getBySource,
  );

  doc.post(
    '/approvals',
    {
      summary: 'Create an approval request',
      tags: ['Approvals'],
      responses: {
        201: { description: 'Approval request created', schema: envelope(approvalRequestSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR'),
    validateBody(createApprovalRequestRequestSchema),
    controller.create,
  );
}
