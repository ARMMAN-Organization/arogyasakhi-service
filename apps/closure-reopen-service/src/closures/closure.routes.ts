import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { ClosureService } from './closure.service';
import { createClosureController } from './closure.controller';
import { createClosureSchema } from './dto/create-closure.dto';
import { decideClosureSchema } from './dto/decide-closure.dto';
import { decideClosureAliasSchema } from './dto/decide-closure-alias.dto';
import { decisionStatusQuerySchema } from './dto/decision-status-query.dto';
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
const createClosureRequestSchema = createClosureSchema.extend({
  localClosureUuid: createClosureSchema.shape.localClosureUuid.openapi({
    example: 'device-abc-closure-001',
  }),
  beneficiaryId: createClosureSchema.shape.beneficiaryId.openapi({
    example: '123e4567-e89b-12d3-a456-426614174000',
  }),
  closureType: createClosureSchema.shape.closureType.openapi({ example: 'MEDICAL' }),
  closureReasonLookupValueId: createClosureSchema.shape.closureReasonLookupValueId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  closureDate: createClosureSchema.shape.closureDate.openapi({
    example: '2026-07-01T00:00:00.000Z',
  }),
  submittedByUserId: createClosureSchema.shape.submittedByUserId.openapi({
    example: '123e4567-e89b-12d3-a456-426614174001',
  }),
});

// Fields mirror `model Closure` in prisma/schema.prisma exactly — no invented
// fields — for accurate Swagger documentation only.
const closureSchema = z.object({
  id: z.string().uuid(),
  localClosureUuid: z.string(),
  beneficiaryId: z.string().uuid(),
  closureType: z.enum(['MEDICAL', 'NON_MEDICAL', 'PROGRAM_COMPLETION']),
  closureReasonLookupValueId: z.string().uuid(),
  eventDate: z.string().datetime().nullable(),
  closureDate: z.string().datetime(),
  submittedByUserId: z.string().uuid(),
  supervisorStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).nullable(),
  supervisorId: z.string().uuid().nullable(),
  supervisorNotes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const closureIdParamsSchema = z
  .object({
    id: z
      .string()
      .uuid()
      .openapi({
        param: { name: 'id', in: 'path' },
        example: '123e4567-e89b-12d3-a456-426614174000',
      }),
  })
  .strict();

const decideClosureRequestSchema = decideClosureSchema.extend({
  decision: decideClosureSchema.shape.decision.openapi({ example: 'APPROVED' }),
});

const decideClosureAliasRequestSchema = decideClosureAliasSchema.extend({
  decision: decideClosureAliasSchema.shape.decision.openapi({ example: 'APPROVE' }),
});

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  details: z.record(z.unknown()).optional(),
});

const decisionStatusRowSchema = z.object({
  id: z.string().uuid(),
  supervisorStatus: z.enum(['PENDING', 'APPROVED', 'REJECTED']).nullable(),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Closure HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body schema
 * is inferred from `validateBody` already in the middleware chain, so
 * `/docs.json` can never drift from what's actually mounted.
 */
export function registerClosureRoutes(doc: DocumentedRouter, service: ClosureService) {
  const controller = createClosureController(service);

  doc.get(
    '/closures',
    {
      summary: 'List closures',
      tags: ['Closures'],
      responses: {
        200: { description: 'Closures retrieved', schema: envelope(z.array(closureSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    controller.list,
  );

  doc.get(
    '/closures/decision-status',
    {
      summary:
        'Real-time supervisorStatus for a batch of closure ids — internal use only, not part ' +
        "of the public Closures API surface. Lets Quick Response's list() reconcile against " +
        "the closure's actual current decision state instead of trusting approval_requests' " +
        'own cached copy, since a closure can be decided directly via PATCH/POST ' +
        '/closures/:id/decision, bypassing approval-service entirely. An id not found or ' +
        'soft-deleted is simply omitted from the result, not an error.',
      tags: ['Closures'],
      query: decisionStatusQuerySchema,
      responses: {
        200: {
          description: 'Closure decision statuses for the requested ids',
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
    '/closures/:id',
    {
      summary:
        "A single closure's full detail — added for Quick Response's card-enrichment " +
        'endpoint (approval-service resolves CLOSURE_REVIEW cards through this), not a ' +
        'general SAKHI-facing read; the app has no existing single-closure-read flow.',
      tags: ['Closures'],
      params: closureIdParamsSchema,
      responses: {
        200: { description: 'Closure detail', schema: envelope(closureSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Closure not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(closureIdParamsSchema, 'params'),
    controller.getById,
  );

  doc.post(
    '/closures',
    {
      summary: 'Create a closure',
      tags: ['Closures'],
      responses: {
        201: { description: 'Closure created', schema: envelope(closureSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validateBody(createClosureRequestSchema),
    controller.create,
  );

  doc.patch(
    '/closures/:id/decision',
    {
      summary: 'Decide a pending closure review (FR-SV-4.4)',
      tags: ['Closures'],
      params: closureIdParamsSchema,
      responses: {
        200: { description: 'Closure decided', schema: envelope(closureSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Closure not found', schema: apiErrorSchema },
        409: { description: 'Already decided', schema: apiErrorSchema },
        422: { description: 'Closure does not require supervisor review', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(closureIdParamsSchema, 'params'),
    validateBody(decideClosureRequestSchema),
    controller.decide,
  );

  doc.post(
    '/closures/:id/decision',
    {
      summary:
        'Decide a pending closure review — Supervisor app alias (POST, APPROVE/REJECT) of the ' +
        "PATCH endpoint above. SUPERVISOR-only, narrower than the PATCH endpoint's " +
        'SUPERVISOR/MANAGER/ADMIN, since this is a new route with no existing callers to ' +
        'preserve compatibility for.',
      tags: ['Closures'],
      params: closureIdParamsSchema,
      responses: {
        200: { description: 'Closure decided', schema: envelope(closureSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Closure not found', schema: apiErrorSchema },
        409: { description: 'Already decided', schema: apiErrorSchema },
        422: { description: 'Closure does not require supervisor review', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR'),
    validate(closureIdParamsSchema, 'params'),
    validateBody(decideClosureAliasRequestSchema),
    controller.decideAlias,
  );
}
