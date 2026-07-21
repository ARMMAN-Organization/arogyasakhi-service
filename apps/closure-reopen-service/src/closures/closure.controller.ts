import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { ClosureService } from './closure.service';
import { createClosureSchema } from './dto/create-closure.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  ok,
  requireRoles,
  trustGatewayIdentity,
  validateBody,
} from '../app.module';

extendZodWithOpenApi(z);

// Request DTO annotated with examples for Swagger UI; validation behavior is
// unchanged (`.openapi()` only attaches documentation metadata).
const createClosureRequestSchema = createClosureSchema.extend({
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
 * Closure HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body schema
 * is inferred from `validateBody` already in the middleware chain, so
 * `/docs.json` can never drift from what's actually mounted.
 */
export function createClosureRouter(service: ClosureService) {
  const doc = createDocumentedRouter();

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
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
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
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
