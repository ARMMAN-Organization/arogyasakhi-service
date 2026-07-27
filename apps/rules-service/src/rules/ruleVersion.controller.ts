import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { RuleVersionService } from './ruleVersion.service';
import { publishRuleVersionSchema } from './dto/publish-ruleVersion.dto';
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

const setIdParamsSchema = z
  .object({ setId: z.string().uuid().openapi({ example: '99999999-9999-9999-9999-999999999999' }) })
  .strict();

const publishRuleVersionRequestSchema = publishRuleVersionSchema.extend({
  // `rulesJson` is a recursive z.lazy() type (see publish-ruleVersion.dto.ts) —
  // zod-to-openapi cannot introspect z.lazy() on its own, so `type: 'object'`
  // is required here to short-circuit its type inference (same pattern as
  // crossFieldRuleSchema in visit-form-service's form-field.dto.ts).
  rulesJson: publishRuleVersionSchema.shape.rulesJson.openapi({
    type: 'object',
    example: { rules: [], version: 'gorules-decision-graph' },
  }),
});

const ruleVersionSchema = z.object({
  id: z.string().uuid(),
  ruleSetId: z.string().uuid(),
  versionNo: z.string().openapi({ example: 'v1' }),
  rulesJson: z.unknown(),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable(),
  publishedByUserId: z.string().uuid().nullable(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']).openapi({ example: 'PUBLISHED' }),
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
 * Rule-pack version admin routes (HLD §4.1 "Key Endpoints"): fetch the current
 * published version of a rule set, and publish a new version. Mounted under the
 * global `api/v1` prefix; the gateway proxies `/admin/rules` here. ADMIN-only,
 * consistent with the rule-set CRUD in ruleSet.controller.ts.
 */
export function createRuleVersionRouter(service: RuleVersionService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/admin/rules/:setId',
    {
      summary: 'Get the current published rule pack version for a rule set',
      tags: ['Rules'],
      params: setIdParamsSchema,
      responses: {
        200: { description: 'Current published rule version', schema: envelope(ruleVersionSchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Rule set unknown or no published version', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validate(setIdParamsSchema, 'params'),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.getPublished(req.params.setId)));
    }),
  );

  doc.post(
    '/admin/rules/:setId/publish',
    {
      summary: 'Publish a new rule pack version (audited)',
      tags: ['Rules'],
      params: setIdParamsSchema,
      responses: {
        201: { description: 'New version published', schema: envelope(ruleVersionSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Rule set not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validate(setIdParamsSchema, 'params'),
    validateBody(publishRuleVersionRequestSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const published = await service.publish(req.params.setId, req.body, req.user.id);
      res.status(201).json(ok(published));
    }),
  );

  return doc;
}
