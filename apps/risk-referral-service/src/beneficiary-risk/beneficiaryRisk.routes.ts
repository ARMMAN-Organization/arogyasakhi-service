import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { BeneficiaryRiskService } from './beneficiaryRisk.service';
import { createBeneficiaryRiskController } from './beneficiaryRisk.controller';
import { beneficiaryRiskParamsSchema } from './dto/get-beneficiary-risk.dto';
import { requireRoles, trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const riskStateSnapshotSchema = z.object({
  id: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  phase: z.enum(['ANC', 'PP', 'NN', 'INC', 'CCV', 'ANC_REGISTRATION']),
  asOfDate: z.string().datetime(),
  ccvState: z
    .enum([
      'NEVER_HR',
      'CURRENTLY_HR_SAM_DANGER',
      'CURRENTLY_HR_OTHER',
      'RECENTLY_RECOVERED',
      'STABLE_LOW_RISK',
    ])
    .nullable(),
  createdAt: z.string().datetime(),
});

const riskFlagViewSchema = z.object({
  id: z.string().uuid(),
  conditionCode: z.string(),
  conditionName: z.string(),
  riskGradeLookupValueId: z.string().uuid(),
  observedValueJson: z.record(z.unknown()).nullable(),
  isReferralTrigger: z.boolean(),
  isEducationTrigger: z.boolean(),
  isHrVisitTrigger: z.boolean(),
});

const riskAssessmentViewSchema = z.object({
  id: z.string().uuid(),
  evaluatedAt: z.string().datetime(),
  overallRiskCategory: z.enum(['NORMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  overallHighRiskFlag: z.boolean(),
  hrDetectedFlag: z.boolean(),
  flags: z.array(riskFlagViewSchema),
});

const beneficiaryRiskProfileSchema = z.object({
  beneficiaryId: z.string().uuid(),
  currentState: z.array(riskStateSnapshotSchema),
  assessments: z.array(riskAssessmentViewSchema),
});

// RISK_GRADE's 6 values (see auth-service seed-data.ts) — null when a flag's
// riskGradeLookupValueId doesn't resolve to a known RISK_GRADE value.
const riskGradeSchema = z
  .enum(['NORMAL', 'MILD', 'MODERATE', 'SEVERE', 'HIGH', 'CRITICAL'])
  .nullable();

const riskConditionSummarySchema = z.object({
  riskConditionId: z.string().uuid(),
  conditionName: z.string(),
  // The real RiskPhase enum (RiskCondition.phase) — NOTE: differs from the
  // HLD/DB-design doc's INFANT_FOLLOWUP/CLOSURE, which use INC/CCV here.
  phase: z.enum(['REGISTRATION', 'ANC', 'DELIVERY', 'PP', 'NN', 'INC', 'CCV']),
  baselineGrade: riskGradeSchema,
  baselineObservedValue: z.record(z.unknown()).nullable(),
  baselineAssessedAt: z.string().datetime(),
  latestGrade: riskGradeSchema,
  latestObservedValue: z.record(z.unknown()).nullable(),
  latestAssessedAt: z.string().datetime(),
  everHighestGrade: riskGradeSchema,
  everAtRiskFlag: z.boolean(),
});

const beneficiaryRiskStateSchema = z.object({
  beneficiaryId: z.string().uuid(),
  riskConditionSummaries: z.array(riskConditionSummarySchema),
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
 * Beneficiary risk profile HTTP routes. Mounted under the global `api/v1`
 * prefix. Backs the reference Android app's "Beneficiary Data Download"
 * screen — offline reference of a beneficiary's current risk state plus her
 * full assessment/flag history. Not part of the SRS/ERD/HLD; reverse
 * engineered from that reference app. A pure read projection over this
 * service's own tables — no writes, no cross-service calls.
 */
export function registerBeneficiaryRiskRoutes(
  doc: DocumentedRouter,
  service: BeneficiaryRiskService,
) {
  const controller = createBeneficiaryRiskController(service);

  doc.get(
    '/beneficiaries/:beneficiaryId/risk',
    {
      summary:
        "A beneficiary's risk profile: currentState (most recent RiskStateSnapshot per " +
        'phase) plus assessments (full RiskAssessment history, each with its RiskFlag rows ' +
        'and their human-readable RiskCondition code/name). A SAKHI may only read her own ' +
        'beneficiary; a SUPERVISOR only a beneficiary on their own roster (resolved via ' +
        'beneficiary-service). MANAGER/ADMIN are unscoped.',
      tags: ['Beneficiary Risk'],
      params: beneficiaryRiskParamsSchema,
      responses: {
        200: {
          description:
            'Risk profile for the beneficiary. Both arrays are empty (not a 404) when the ' +
            'beneficiaryId has risk-relevant data missing, but the beneficiary itself exists ' +
            'and is in scope.',
          schema: envelope(beneficiaryRiskProfileSchema),
        },
        400: { description: 'Malformed beneficiaryId', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: "Caller role not permitted, or beneficiary outside the caller's scope",
          schema: apiErrorSchema,
        },
        404: { description: 'Beneficiary not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(beneficiaryRiskParamsSchema, 'params'),
    controller.getRiskProfile,
  );

  doc.get(
    '/beneficiaries/:beneficiaryId/risk-state',
    {
      summary:
        "A beneficiary's current and historical risk classification, per HLD line 204 — one " +
        'summary row per riskConditionId, derived from every RiskFlag ever recorded across ' +
        "all of the beneficiary's assessments. Same role-scoping as GET " +
        '/beneficiaries/:beneficiaryId/risk (SAKHI self / SUPERVISOR roster / MANAGER+ADMIN ' +
        'unscoped). NOTE: baselineGrade/everHighestGrade are derived from this data, not from ' +
        "a dedicated baseline-tracking table (this service doesn't maintain one) — " +
        'baselineGrade is the earliest flag on record for that condition in this environment, ' +
        "not necessarily the beneficiary's true registration-time baseline.",
      tags: ['Beneficiary Risk'],
      params: beneficiaryRiskParamsSchema,
      responses: {
        200: {
          description:
            'riskConditionSummaries is empty (not a 404) when the beneficiary has no ' +
            'risk-relevant data, but exists and is in scope.',
          schema: envelope(beneficiaryRiskStateSchema),
        },
        400: { description: 'Malformed beneficiaryId', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: "Caller role not permitted, or beneficiary outside the caller's scope",
          schema: apiErrorSchema,
        },
        404: { description: 'Beneficiary not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(beneficiaryRiskParamsSchema, 'params'),
    controller.getRiskState,
  );
}
