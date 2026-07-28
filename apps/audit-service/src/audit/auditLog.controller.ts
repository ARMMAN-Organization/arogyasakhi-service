import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { AuditLogService } from './auditLog.service';
import { createAuditLogSchema } from './dto/create-auditLog.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  ok,
  requireRoles,
  trustGatewayIdentity,
  validateBody,
} from '../app.module';

extendZodWithOpenApi(z);

const jsonValueSchema: z.ZodTypeAny = z.unknown().openapi({
  description: 'Arbitrary JSON value.',
});

// Request DTO annotated with examples for Swagger UI; validation behavior is
// unchanged (`.openapi()` only attaches documentation metadata).
// beforeJson/afterJson are built on z.lazy() (see create-auditLog.dto.ts) —
// zod-to-openapi cannot introspect z.lazy() on its own, so `type: 'object'`
// is required here to short-circuit its type inference.
const createAuditLogRequestSchema = createAuditLogSchema.extend({
  beforeJson: createAuditLogSchema.shape.beforeJson.openapi({ type: 'object', example: {} }),
  afterJson: createAuditLogSchema.shape.afterJson.openapi({ type: 'object', example: {} }),
});

const auditLogRecordSchema = z.object({
  id: z.string().uuid(),
  actorUserId: z.string().nullable().openapi({ example: 'jane.sakhi' }),
  action: z.string().openapi({ example: 'USER_LOGIN' }),
  entityType: z.string().openapi({ example: 'User' }),
  entityId: z.string().nullable(),
  beforeJson: jsonValueSchema.nullable(),
  afterJson: jsonValueSchema.nullable(),
  ipAddress: z.string().nullable().openapi({ example: '203.0.113.10' }),
  deviceId: z.string().nullable(),
  createdAt: z.string().datetime(),
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
 * Audit log HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body schema
 * is inferred from `validateBody` already in the middleware chain, so
 * `/docs.json` can never drift from what's actually mounted.
 */
export function createAuditLogRouter(service: AuditLogService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/audit',
    {
      summary: 'List the most recent audit log entries',
      tags: ['Audit'],
      responses: {
        200: { description: 'Audit log entries', schema: envelope(z.array(auditLogRecordSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN', 'MANAGER'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  doc.post(
    '/audit',
    {
      summary: 'Create an audit log entry',
      tags: ['Audit'],
      responses: {
        201: { description: 'Audit log entry created', schema: envelope(auditLogRecordSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validateBody(createAuditLogRequestSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
