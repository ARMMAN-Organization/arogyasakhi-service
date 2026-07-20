import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { VisitInstanceService } from './visitInstance.service';
import { createVisitInstanceSchema } from './dto/create-visitInstance.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  errorResponse,
  ok,
  requireRoles,
  trustGatewayIdentity,
  validateBody,
} from '../app.module';

extendZodWithOpenApi(z);

// Request DTO annotated with examples for Swagger UI; validation behavior is
// unchanged (`.openapi()` only attaches documentation metadata).
const createVisitInstanceRequestSchema = createVisitInstanceSchema.extend({
  scheduleId: createVisitInstanceSchema.shape.scheduleId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  beneficiaryId: createVisitInstanceSchema.shape.beneficiaryId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  sakhiId: createVisitInstanceSchema.shape.sakhiId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  localVisitUuid: createVisitInstanceSchema.shape.localVisitUuid.openapi({
    example: 'device-abc-visit-001',
  }),
  statusLookupValueId: createVisitInstanceSchema.shape.statusLookupValueId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
});

const visitInstanceSchema = z.object({
  id: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  scheduleId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  beneficiaryId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  sakhiId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  localVisitUuid: z.string().openapi({ example: 'device-abc-visit-001' }),
  actualVisitDate: z
    .string()
    .datetime()
    .nullable()
    .openapi({ example: '2026-07-20T00:00:00.000Z' }),
  statusLookupValueId: z
    .string()
    .uuid()
    .openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  meetBeneficiaryFlag: z.boolean().nullable().openapi({ example: true }),
  notMetReason: z.string().nullable().openapi({ example: null }),
  completedAt: z.string().datetime().nullable().openapi({ example: '2026-07-20T10:15:00.000Z' }),
  syncedAt: z.string().datetime().nullable().openapi({ example: null }),
  createdAt: z.string().datetime().openapi({ example: '2026-07-20T10:15:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-07-20T10:15:00.000Z' }),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Visit instance HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body schema is
 * inferred from `validateBody` already in the middleware chain, so
 * `/docs.json` can never drift from what's actually mounted.
 */
export function createVisitInstanceRouter(service: VisitInstanceService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/visits',
    {
      summary: 'List recent visit instances',
      tags: ['Visits'],
      responses: {
        200: { description: 'Visit instances', schema: envelope(z.array(visitInstanceSchema)) },
        401: errorResponse(401),
        403: errorResponse(403),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  doc.post(
    '/visits',
    {
      summary: 'Create a visit instance',
      tags: ['Visits'],
      responses: {
        201: { description: 'Visit instance created', schema: envelope(visitInstanceSchema) },
        400: errorResponse(400, { message: 'beneficiaryId: Required' }),
        401: errorResponse(401),
        403: errorResponse(403),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validateBody(createVisitInstanceRequestSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
