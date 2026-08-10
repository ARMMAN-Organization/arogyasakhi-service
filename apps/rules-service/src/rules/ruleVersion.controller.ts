import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { RuleVersionService } from './ruleVersion.service';
import { publishRuleVersionSchema } from './dto/publish-ruleVersion.dto';
import { evaluateRuleSetSchema } from './dto/evaluate-ruleSet.dto';
import { evaluateScheduleSchema } from './dto/evaluate-schedule.dto';
import { SCHEDULE_KINDS } from './scheduleEvaluator';
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

const versionIdParamsSchema = z
  .object({
    versionId: z.string().uuid().openapi({ example: '99999999-9999-9999-9999-999999999999' }),
  })
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

// Deliberately narrower than ruleVersionSchema — omits rulesJson/effectiveFrom/
// effectiveTo/publishedByUserId, which a non-admin caller (any other service
// verifying a generatedByRuleVersionId) has no reason to see.
const ruleVersionSummarySchema = z.object({
  id: z.string().uuid(),
  ruleSetId: z.string().uuid(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']).openapi({ example: 'PUBLISHED' }),
});

const evaluateRuleSetRequestSchema = evaluateRuleSetSchema.extend({
  // zod-to-openapi can't introspect the recursive z.lazy() answers type on
  // its own — same short-circuit as rulesJson above.
  answers: evaluateRuleSetSchema.shape.answers.openapi({
    type: 'object',
    example: { systolicBp: 145, hemoglobin: 9.2 },
  }),
});

const riskEvaluationResultSchema = z.object({
  riskConditionId: z.string().uuid(),
  grade: z.string().openapi({ example: 'HIGH' }),
  gradeRank: z.number().int(),
  isReferralTrigger: z.boolean(),
  isEducationTrigger: z.boolean(),
  isHrVisitTrigger: z.boolean(),
  observedValueJson: z.record(z.unknown()).nullable(),
});

const evaluateResponseSchema = z.object({
  ruleVersionId: z.string().uuid(),
  overallRiskCategory: z
    .enum(['NORMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
    .openapi({ example: 'HIGH' }),
  conditions: z.array(riskEvaluationResultSchema),
});

const evaluateScheduleRequestSchema = evaluateScheduleSchema.extend({
  // zod-to-openapi can't introspect the recursive z.lazy() input type on its
  // own — same short-circuit as rulesJson/answers above.
  input: evaluateScheduleSchema.shape.input.openapi({
    type: 'object',
    example: { registrationDate: '2026-01-01', edd: '2026-10-08' },
  }),
});

const scheduleEvaluateResponseSchema = z
  .object({ ruleVersionId: z.string().uuid() })
  .catchall(z.unknown())
  .openapi({
    description:
      "ruleVersionId plus the schedule pack's own output fields, shaped per scheduleKind " +
      '(visits[]/totalRegularVisits for ANC, visits[]/riskState for CCV, etc. — see ' +
      'scheduleEvaluator.ts for the exact contract per scheduleKind).',
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
    '/rules/versions/:versionId',
    {
      summary: 'Get a rule version by id (any authenticated role)',
      tags: ['Rules'],
      params: versionIdParamsSchema,
      responses: {
        200: { description: 'Rule version summary', schema: envelope(ruleVersionSummarySchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        404: { description: 'Rule version not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(versionIdParamsSchema, 'params'),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.getById(req.params.versionId)));
    }),
  );

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

  doc.post(
    '/rules/:setId/evaluate',
    {
      summary:
        "Evaluate the rule set's currently-published gorules decision graph against caller-" +
        "supplied answers. Gated by requireRoles('SAKHI') — this codebase has no machine/" +
        'service-account identity, so "server-to-server" here just means the SAKHI\'s own ' +
        'forwarded token from the originating form-submission call chain (visit-form-service ' +
        '-> risk-referral-service -> here). Never evaluates against a DRAFT version.',
      tags: ['Rules'],
      params: setIdParamsSchema,
      responses: {
        200: { description: 'Evaluation results', schema: envelope(evaluateResponseSchema) },
        400: { description: 'Malformed answers or decision-graph output', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: {
          description: 'Rule set not found, or it has no published version',
          schema: apiErrorSchema,
        },
        500: { description: 'Server error', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validate(setIdParamsSchema, 'params'),
    validateBody(evaluateRuleSetRequestSchema),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.evaluate(req.params.setId, req.body)));
    }),
  );

  doc.post(
    '/rules/:setId/evaluate-schedule',
    {
      summary:
        "Evaluate the rule set's currently-published gorules SCHEDULE decision graph " +
        `(scheduleKind one of ${SCHEDULE_KINDS.join(', ')} — SRS §3A.2.3, Appendix A/B/G) ` +
        'against caller-supplied input. Never evaluates against a DRAFT version.',
      tags: ['Rules'],
      params: setIdParamsSchema,
      responses: {
        200: {
          description: 'Schedule evaluation result',
          schema: envelope(scheduleEvaluateResponseSchema),
        },
        400: { description: 'Malformed input or decision-graph output', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: {
          description: 'Rule set not found, or it has no published version',
          schema: apiErrorSchema,
        },
        500: { description: 'Server error', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validate(setIdParamsSchema, 'params'),
    validateBody(evaluateScheduleRequestSchema),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.evaluateSchedule(req.params.setId, req.body)));
    }),
  );

  return doc;
}
