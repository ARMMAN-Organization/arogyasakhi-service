import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { SyncBatchService } from './syncBatch.service';
import { createSyncBatchSchema } from './dto/create-syncBatch.dto';
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
const createSyncBatchRequestSchema = createSyncBatchSchema.extend({
  deviceId: createSyncBatchSchema.shape.deviceId.openapi({
    example: '9f2c1b3a-4d5e-4f6a-8b7c-1d2e3f4a5b6c',
  }),
  userId: createSyncBatchSchema.shape.userId.openapi({
    example: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
  }),
  direction: createSyncBatchSchema.shape.direction.openapi({ example: 'UPLOAD' }),
  startedAt: createSyncBatchSchema.shape.startedAt.openapi({ example: '2026-07-16T08:00:00.000Z' }),
  status: createSyncBatchSchema.shape.status.openapi({ example: 'STARTED' }),
});

const syncBatchSchema = z.object({
  id: z.string().uuid(),
  deviceId: z.string().uuid(),
  userId: z.string().uuid(),
  direction: z.enum(['UPLOAD', 'DOWNLOAD']),
  startedAt: z.string().datetime(),
  completedAt: z.string().datetime().nullable(),
  status: z.enum(['STARTED', 'COMPLETED', 'FAILED', 'PARTIAL', 'CANCELLED']),
  appVersion: z.string().nullable(),
  networkType: z.enum(['WIFI', 'MOBILE', 'OFFLINE', 'UNKNOWN']).nullable(),
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
 * Sync batch HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body schema
 * is inferred from `validateBody` already in the middleware chain, so
 * `/docs.json` can never drift from what's actually mounted.
 */
export function createSyncBatchRouter(service: SyncBatchService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/sync',
    {
      summary: 'List recent sync batches',
      tags: ['Sync'],
      responses: {
        200: {
          description: 'Most recent sync batches',
          schema: envelope(z.array(syncBatchSchema)),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  doc.post(
    '/sync',
    {
      summary: 'Record a new sync batch',
      tags: ['Sync'],
      responses: {
        201: { description: 'Sync batch created', schema: envelope(syncBatchSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR'),
    validateBody(createSyncBatchRequestSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
