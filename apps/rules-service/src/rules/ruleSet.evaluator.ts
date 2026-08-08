import { ZenDecisionContent, ZenEngine } from '@gorules/zen-engine';
import { badRequest } from '@armman/service-commons';

const OVERALL_RISK_CATEGORIES = ['NORMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
type OverallRiskCategory = (typeof OVERALL_RISK_CATEGORIES)[number];

/**
 * Per-condition evaluation result the decision graph is expected to output —
 * risk-referral-service's contract for POST /risk-assessments. This service
 * doesn't validate the *content* of the output beyond structural shape — it
 * has no domain knowledge of what a valid grade/riskConditionId looks like,
 * only that the decision graph returned something risk-referral-service can
 * consume.
 */
export interface RiskEvaluationResult {
  riskConditionId: string;
  grade: string;
  gradeRank: number;
  isReferralTrigger: boolean;
  isEducationTrigger: boolean;
  isHrVisitTrigger: boolean;
  observedValueJson: Record<string, unknown> | null;
}

export interface RulePackEvaluation {
  /**
   * The visit-level rollup category — deliberately computed by the rule
   * pack itself (the business-rule author), not derived here: there is no
   * existing cross-condition comparison rule to roll up multiple
   * independent gradeScale results (BINARY / NORMAL_MILD_MODERATE_SEVERE /
   * NORMAL_LOW_MEDIUM_HIGH per the ERD) into one overall category, and
   * inventing one in this generic executor would bake an unreviewed
   * business decision into infrastructure code.
   */
  overallRiskCategory: OverallRiskCategory;
  conditions: RiskEvaluationResult[];
}

/**
 * Runs a published rule version's gorules decision graph against `answers`
 * and returns the visit-level category plus per-condition results. Wraps
 * zen-engine's ZenEngine/ZenDecisionContent — a fresh instance per call
 * rather than a cached/pooled engine, since evaluate() is called relatively
 * infrequently (once per visit-linked form submission) and correctness
 * (always evaluating the exact rulesJson passed in) matters more here than
 * shaving engine-construction overhead.
 *
 * Throws badRequest() if the decision graph's output isn't the expected
 * shape — a malformed/mismatched rule pack must surface as a client (400)
 * error to whoever published it, not a 500 masking a config problem.
 * zen-engine's own evaluation errors (malformed rulesJson, missing fields
 * the graph requires) propagate as-is; the controller/service layer decides
 * how those map to HTTP status.
 */
export async function evaluateRulePack(
  rulesJson: unknown,
  answers: Record<string, unknown>,
): Promise<RulePackEvaluation> {
  const engine = new ZenEngine();
  const content = new ZenDecisionContent(rulesJson as object);
  const decision = engine.createDecision(content);
  const response = await decision.evaluate(answers);
  engine.dispose();

  const result = response.result;
  if (typeof result !== 'object' || result === null) {
    throw badRequest(
      "This rule pack's decision graph did not return an { overallRiskCategory, conditions } object.",
    );
  }
  const r = result as Record<string, unknown>;

  if (!OVERALL_RISK_CATEGORIES.includes(r.overallRiskCategory as OverallRiskCategory)) {
    throw badRequest(`overallRiskCategory must be one of ${OVERALL_RISK_CATEGORIES.join(', ')}.`);
  }
  if (!Array.isArray(r.conditions)) {
    throw badRequest('conditions must be an array of per-condition results.');
  }

  return {
    overallRiskCategory: r.overallRiskCategory as OverallRiskCategory,
    conditions: r.conditions.map((entry, index) => validateResultEntry(entry, index)),
  };
}

function validateResultEntry(entry: unknown, index: number): RiskEvaluationResult {
  if (typeof entry !== 'object' || entry === null) {
    throw badRequest(`conditions[${index}] from the decision graph is not an object.`);
  }
  const e = entry as Record<string, unknown>;
  if (typeof e.riskConditionId !== 'string') {
    throw badRequest(`conditions[${index}].riskConditionId must be a string.`);
  }
  if (typeof e.grade !== 'string') {
    throw badRequest(`conditions[${index}].grade must be a string.`);
  }
  if (typeof e.gradeRank !== 'number') {
    throw badRequest(`conditions[${index}].gradeRank must be a number.`);
  }
  if (typeof e.isReferralTrigger !== 'boolean') {
    throw badRequest(`conditions[${index}].isReferralTrigger must be a boolean.`);
  }
  if (typeof e.isEducationTrigger !== 'boolean') {
    throw badRequest(`conditions[${index}].isEducationTrigger must be a boolean.`);
  }
  if (typeof e.isHrVisitTrigger !== 'boolean') {
    throw badRequest(`conditions[${index}].isHrVisitTrigger must be a boolean.`);
  }
  return {
    riskConditionId: e.riskConditionId,
    grade: e.grade,
    gradeRank: e.gradeRank,
    isReferralTrigger: e.isReferralTrigger,
    isEducationTrigger: e.isEducationTrigger,
    isHrVisitTrigger: e.isHrVisitTrigger,
    observedValueJson: (e.observedValueJson as Record<string, unknown> | undefined) ?? null,
  };
}
