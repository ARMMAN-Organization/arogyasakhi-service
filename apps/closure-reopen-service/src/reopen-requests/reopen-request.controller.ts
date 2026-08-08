import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { ReopenRequestService } from './reopen-request.service';
import { createReopenRequestSchema } from './dto/create-reopen-request.dto';
import { decideReopenRequestSchema } from './dto/decide-reopen-request.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  ok,
  requireRoles,
  trustGatewayIdentity,
  unauthorized,
  validate,
  validateBody,
} from '../app.module';

extendZodWithOpenApi(z);

const reopenRequestIdParamsSchema = z
  .object({ id: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }) })
  .strict();

const decideReopenRequestRequestSchema = decideReopenRequestSchema.extend({
  decision: decideReopenRequestSchema.shape.decision.openapi({ example: 'APPROVED' }),
});

// Fields mirror `model ReopenRequest` in prisma/schema.prisma exactly — no
// invented fields — for accurate Swagger documentation only.
const reopenRequestSchema = z.object({
  id: z.string().uuid(),
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

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Reopen request HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Wider than Quick Response's own SUPERVISOR-only decision endpoint —
 * SUPERVISOR/MANAGER/ADMIN matches this service's existing route convention
 * (see closure.controller.ts's GET /closures). approval-service's
 * POST /quick-response/:cardId/decision stays SUPERVISOR-only at its own
 * layer; this endpoint isn't artificially narrower than its siblings.
 *
 * The audit_log entry and Sakhi notification are written here, in
 * `ReopenRequestService.decide`, not by callers — so they happen
 * regardless of whether this endpoint is reached via Quick Response or
 * called directly.
 */
export function createReopenRequestRouter(service: ReopenRequestService) {
  const doc = createDocumentedRouter();

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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.create(req.body, req.user.id, req.headers.authorization ?? '');
      res.status(201).json(ok(created));
    }),
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
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const updated = await service.decide(
        req.params.id,
        req.user.id,
        req.body,
        req.headers.authorization ?? '',
      );
      res.json(ok(updated));
    }),
  );

  return doc;
}
