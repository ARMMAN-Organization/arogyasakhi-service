import { ZenDecisionContent, ZenEngine } from '@gorules/zen-engine';
import { badRequest } from '@armman/service-commons';

const OVERALL_RISK_CATEGORIES = ['NORMAL', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
type OverallRiskCategory = (typeof OVERALL_RISK_CATEGORIES)[number];

/**
 * Runs any gorules decision graph against `input` and returns its raw
 * `result` object, with no assumption about output shape. Category-specific
 * evaluators (evaluateRulePack for RISK, evaluateScheduleRulePack for
 * SCHEDULE, evaluateEscalationRulePack for ESCALATION) each validate this raw
 * result against their own contract — kept separate from graph execution so a
 * new rule category never has to touch the RISK-shape validation logic below.
 *
 * A fresh ZenEngine/ZenDecisionContent per call, not a cached/pooled engine —
 * same rationale as evaluateRulePack: evaluate() calls are infrequent
 * (per visit-linked form submission or per schedule/escalation check), so
 * correctness beats shaving engine-construction overhead.
 */
export async function runDecisionGraph(
  rulesJson: unknown,
  input: Record<string, unknown>,
): Promise<unknown> {
  const engine = new ZenEngine();
  const content = new ZenDecisionContent(rulesJson as object);
  const decision = engine.createDecision(content);
  const response = await decision.evaluate(input);
  engine.dispose();
  return response.result;
}

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
  const result = await runDecisionGraph(rulesJson, answers);

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

const VISIT_CODE_TYPES = [
  'ANC',
  'ANC_HR',
  'ANC_POST_EDD',
  'DELIVERY',
  'PP',
  'NN',
  'INC',
  'INC_HR',
  'CCV',
  'CCV_HR',
] as const;

const ANCHOR_TYPES = [
  'REGISTRATION',
  'LMP',
  'EDD',
  'DELIVERY_DATE',
  'DOB',
  'ACTUAL_VISIT',
  'CCV_TRANSITION',
] as const;

/**
 * One generated visit-schedule row. Field set deliberately mirrors
 * visit-form-service's bulkScheduleRowSchema (create-visit-schedule-bulk.dto.ts)
 * so a SCHEDULE decision graph's output can be forwarded there unchanged —
 * duplicated rather than imported, per the forklift rule (no cross-service
 * imports).
 */
export interface ScheduleRow {
  localScheduleUuid: string;
  visitCode: string;
  visitType: (typeof VISIT_CODE_TYPES)[number];
  sequenceNo: number;
  scheduledDate: string;
  windowStartDate: string;
  windowEndDate: string;
  anchorType: (typeof ANCHOR_TYPES)[number];
  anchorVisitLocalUuid: string | null;
}

export interface ScheduleEvaluation {
  scheduleRows: ScheduleRow[];
}

/**
 * Runs a SCHEDULE rule version's decision graph against `input` (registration/
 * delivery/DOB context for one visit family + candidate visit index — see
 * scheduleOrchestrator.ts) and validates the output is a well-formed array of
 * schedule rows. Throws badRequest() on a malformed decision-graph output, same
 * convention as evaluateRulePack.
 */
export async function evaluateScheduleRulePack(
  rulesJson: unknown,
  input: Record<string, unknown>,
): Promise<ScheduleEvaluation> {
  const result = await runDecisionGraph(rulesJson, input);

  if (typeof result !== 'object' || result === null) {
    throw badRequest("This rule pack's decision graph did not return an { scheduleRows } object.");
  }
  const r = result as Record<string, unknown>;
  if (!Array.isArray(r.scheduleRows)) {
    throw badRequest('scheduleRows must be an array of schedule rows.');
  }

  return { scheduleRows: r.scheduleRows.map((entry, index) => validateScheduleRow(entry, index)) };
}

function validateScheduleRow(entry: unknown, index: number): ScheduleRow {
  if (typeof entry !== 'object' || entry === null) {
    throw badRequest(`scheduleRows[${index}] from the decision graph is not an object.`);
  }
  const e = entry as Record<string, unknown>;
  if (typeof e.localScheduleUuid !== 'string') {
    throw badRequest(`scheduleRows[${index}].localScheduleUuid must be a string.`);
  }
  if (typeof e.visitCode !== 'string') {
    throw badRequest(`scheduleRows[${index}].visitCode must be a string.`);
  }
  if (!VISIT_CODE_TYPES.includes(e.visitType as (typeof VISIT_CODE_TYPES)[number])) {
    throw badRequest(
      `scheduleRows[${index}].visitType must be one of ${VISIT_CODE_TYPES.join(', ')}.`,
    );
  }
  if (typeof e.sequenceNo !== 'number') {
    throw badRequest(`scheduleRows[${index}].sequenceNo must be a number.`);
  }
  if (typeof e.scheduledDate !== 'string') {
    throw badRequest(`scheduleRows[${index}].scheduledDate must be a date-only string.`);
  }
  if (typeof e.windowStartDate !== 'string') {
    throw badRequest(`scheduleRows[${index}].windowStartDate must be a date-only string.`);
  }
  if (typeof e.windowEndDate !== 'string') {
    throw badRequest(`scheduleRows[${index}].windowEndDate must be a date-only string.`);
  }
  if (e.windowStartDate > e.windowEndDate) {
    throw badRequest(`scheduleRows[${index}].windowStartDate must be on or before windowEndDate.`);
  }
  if (!ANCHOR_TYPES.includes(e.anchorType as (typeof ANCHOR_TYPES)[number])) {
    throw badRequest(
      `scheduleRows[${index}].anchorType must be one of ${ANCHOR_TYPES.join(', ')}.`,
    );
  }
  if (e.anchorVisitLocalUuid !== null && typeof e.anchorVisitLocalUuid !== 'string') {
    throw badRequest(`scheduleRows[${index}].anchorVisitLocalUuid must be a string or null.`);
  }
  return {
    localScheduleUuid: e.localScheduleUuid,
    visitCode: e.visitCode,
    visitType: e.visitType as (typeof VISIT_CODE_TYPES)[number],
    sequenceNo: e.sequenceNo,
    scheduledDate: e.scheduledDate,
    windowStartDate: e.windowStartDate,
    windowEndDate: e.windowEndDate,
    anchorType: e.anchorType as (typeof ANCHOR_TYPES)[number],
    anchorVisitLocalUuid: e.anchorVisitLocalUuid,
  };
}

export interface EscalationEvaluation {
  shouldEscalate: boolean;
  reasonCode: string;
}

/**
 * Runs an ESCALATION rule version's decision graph against `input` (visit
 * family, consecutive-missed count, whether the missed visit is an HR visit)
 * and validates the output shape. Throws badRequest() on a malformed output.
 */
export async function evaluateEscalationRulePack(
  rulesJson: unknown,
  input: Record<string, unknown>,
): Promise<EscalationEvaluation> {
  const result = await runDecisionGraph(rulesJson, input);

  if (typeof result !== 'object' || result === null) {
    throw badRequest(
      "This rule pack's decision graph did not return a { shouldEscalate, reasonCode } object.",
    );
  }
  const r = result as Record<string, unknown>;
  if (typeof r.shouldEscalate !== 'boolean') {
    throw badRequest('shouldEscalate must be a boolean.');
  }
  if (typeof r.reasonCode !== 'string') {
    throw badRequest('reasonCode must be a string.');
  }
  return { shouldEscalate: r.shouldEscalate, reasonCode: r.reasonCode };
}
