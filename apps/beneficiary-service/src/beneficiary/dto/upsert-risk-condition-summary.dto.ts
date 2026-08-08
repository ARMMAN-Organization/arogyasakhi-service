import { z } from 'zod';
import { SUMMARY_PHASES } from '../beneficiary.constants';

/**
 * Request body for `PATCH /beneficiaries/:id/risk-condition-summary` — pushed
 * server-to-server by risk-referral-service after it evaluates a submission
 * and writes its own RiskAssessment/RiskFlag source-of-truth rows. This
 * service doesn't own risk_conditions (no cross-service joins per the
 * forklift rule), so `gradeRank` is supplied pre-computed by the caller, who
 * does own that table and its per-condition gradeScale — see the
 * `latestGradeRank` schema comment on BeneficiaryRiskConditionSummary.
 */
export const upsertRiskConditionSummarySchema = z
  .object({
    riskConditionId: z.string().uuid(),
    phase: z.enum(SUMMARY_PHASES),
    grade: z.string().min(1).max(50),
    gradeRank: z.number().int(),
    observedValueJson: z.record(z.string(), z.unknown()).nullable().optional(),
    visitId: z.string().uuid().nullable().optional(),
    submissionId: z.string().uuid().nullable().optional(),
    assessedAt: z.coerce.date(),
    isReferralTrigger: z.boolean(),
    isHrVisitTrigger: z.boolean(),
    ruleVersionId: z.string().uuid().nullable().optional(),
  })
  .strict();

export type UpsertRiskConditionSummaryInput = z.infer<typeof upsertRiskConditionSummarySchema>;
