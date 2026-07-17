import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { RuleSetService } from './ruleSet.service';
import { createRuleSetSchema } from './dto/create-ruleSet.dto';
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
const createRuleSetRequestSchema = createRuleSetSchema.extend({
  ruleCategory: createRuleSetSchema.shape.ruleCategory.openapi({ example: 'RISK' }),
  ruleSetName: createRuleSetSchema.shape.ruleSetName.openapi({ example: 'High risk escalation' }),
  status: createRuleSetSchema.shape.status.openapi({ example: 'DRAFT' }),
});

const ruleSetSchema = z.object({
  id: z.string().uuid(),
  ruleCategory: z
    .enum(['SCHEDULE', 'RISK', 'ESCALATION', 'INCENTIVE', 'CLOSURE', 'NOTIFICATION'])
    .openapi({ example: 'RISK' }),
  ruleSetName: z.string().openapi({ example: 'High risk escalation' }),
  status: z.enum(['DRAFT', 'ACTIVE', 'RETIRED']).openapi({ example: 'DRAFT' }),
  createdAt: z.string().datetime(),
  createdByUserId: z.string().nullable(),
  updatedAt: z.string().datetime(),
  updatedByUserId: z.string().nullable(),
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
 * Rule set HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body schema
 * is inferred from `validateBody` already in the middleware chain, so
 * `/docs.json` can never drift from what's actually mounted.
 */
export function createRuleSetRouter(service: RuleSetService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/rules',
    {
      summary: 'List rule sets',
      tags: ['Rules'],
      responses: {
        200: { description: 'Rule sets', schema: envelope(z.array(ruleSetSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  doc.post(
    '/rules',
    {
      summary: 'Create a rule set',
      tags: ['Rules'],
      responses: {
        201: { description: 'Rule set created', schema: envelope(ruleSetSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validateBody(createRuleSetRequestSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
