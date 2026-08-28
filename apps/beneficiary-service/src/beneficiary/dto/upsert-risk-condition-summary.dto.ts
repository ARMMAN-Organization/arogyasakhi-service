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
 *
 * `grade`/`gradeRank` are optional/nullable to also accept self-reported,
 * ungraded entries — e.g. a mother's enrollment-time diagnosed conditions or
 * sickle cell status, pushed by visit-form-service after a MOTHER_REGISTRATION
 * submission, which has no rule-engine grade to compute.
 */
export const upsertRiskConditionSummarySchema = z
  .object({
    riskConditionId: z.string().uuid(),
    phase: z.enum(SUMMARY_PHASES),
    grade: z.string().min(1).max(50).nullable().optional(),
    gradeRank: z.number().int().nullable().optional(),
    observedValueJson: z.record(z.string(), z.unknown()).nullable().optional(),
    visitId: z.string().uuid().nullable().optional(),
    submissionId: z.string().uuid().nullable().optional(),
    assessedAt: z.coerce.date(),
    isReferralTrigger: z.boolean(),
    isHrVisitTrigger: z.boolean(),
    ruleVersionId: z.string().uuid().nullable().optional(),
    // Whether this grading pass is the first time this condition has ever
    // been flagged for this beneficiary — always-latest, not "ever" (see
    // BeneficiaryRepository.upsertRiskConditionSummary), same as
    // isReferralTrigger/isHrVisitTrigger above.
    isFirstInstance: z.boolean(),
    // Length of the current "no improvement" streak, for phases that track
    // it (NN/INC/CCV) — null for phases where this doesn't apply.
    consecutiveNoImprovementCount: z.number().int().nullable(),
  })
  .strict();

export type UpsertRiskConditionSummaryInput = z.infer<typeof upsertRiskConditionSummarySchema>;
