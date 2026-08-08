import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { RiskAssessmentService } from './riskAssessment.service';
import { createRiskAssessmentSchema } from './dto/create-riskAssessment.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  requireRoles,
  trustGatewayIdentity,
  unauthorized,
  validateBody,
  ok,
} from '../app.module';

extendZodWithOpenApi(z);

const createRiskAssessmentRequestSchema = createRiskAssessmentSchema.extend({
  beneficiaryId: createRiskAssessmentSchema.shape.beneficiaryId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  submissionId: createRiskAssessmentSchema.shape.submissionId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  ruleSetId: createRiskAssessmentSchema.shape.ruleSetId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  // zod-to-openapi can't introspect the recursive z.lazy() answers type on
  // its own — same short-circuit as evaluate-ruleSet.dto.ts's answers field.
  answers: createRiskAssessmentSchema.shape.answers.openapi({
    type: 'object',
    example: { systolicBp: 145, hemoglobin: 9.2 },
  }),
});

const riskFlagSchema = z.object({
  id: z.string().uuid(),
  riskConditionId: z.string().uuid(),
  riskGradeLookupValueId: z.string().uuid(),
  observedValueJson: z.record(z.unknown()).nullable(),
  isReferralTrigger: z.boolean(),
  isEducationTrigger: z.boolean(),
  isHrVisitTrigger: z.boolean(),
});

const riskAssessmentSchema = z.object({
  id: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  visitId: z.string().uuid().nullable(),
  submissionId: z.string().uuid(),
  ruleVersionId: z.string().uuid(),
  evaluatedAt: z.string().datetime(),
  overallRiskCategory: z.enum(['NORMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  overallHighRiskFlag: z.boolean(),
  hrDetectedFlag: z.boolean(),
  riskFlags: z.array(riskFlagSchema),
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
 * Risk assessment HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Called server-to-server by visit-form-service after it persists a
 * visit-linked, VALID form submission — see riskAssessment.service.ts for
 * the full evaluate -> persist -> push pipeline. Gated by
 * requireRoles('SAKHI') since this codebase has no machine/service-account
 * identity: the call chain forwards the SAKHI's own token from the
 * originating submission.
 */
export function createRiskAssessmentRouter(service: RiskAssessmentService) {
  const doc = createDocumentedRouter();

  doc.post(
    '/risk-assessments',
    {
      summary:
        "Evaluate a submission against its form's rule set and persist the resulting " +
        'RiskAssessment/RiskFlag rows, then push the per-condition rollup to ' +
        'beneficiary-service. Idempotent by submissionId — a retried call returns the ' +
        'original assessment rather than re-evaluating.',
      tags: ['Risk Assessments'],
      responses: {
        201: { description: 'Risk assessment created', schema: envelope(riskAssessmentSchema) },
        200: {
          description: 'Existing risk assessment for this submissionId returned as-is',
          schema: envelope(riskAssessmentSchema),
        },
        400: {
          description: 'Malformed answers, or the rule pack returned an unrecognized grade',
          schema: apiErrorSchema,
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: "Caller role not permitted, or beneficiary outside caller's own roster",
          schema: apiErrorSchema,
        },
        404: { description: 'Beneficiary case not found', schema: apiErrorSchema },
        422: {
          description: 'No published rule pack version found for the given ruleSetId',
          schema: apiErrorSchema,
        },
        502: {
          description: 'rules-service or beneficiary-service unreachable',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validateBody(createRiskAssessmentRequestSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const created = await service.create(req.body, req.user, authorizationHeader);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
