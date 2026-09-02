import { badRequest, forbidden, notFound, type AuthenticatedUser } from '@armman/service-commons';
import type { Prisma } from '../../../../node_modules/.prisma/client-risk-referral-service';
import type { RiskAssessmentRepository, RiskFlagCreateData } from './riskAssessment.repository';
import type { CreateRiskAssessmentInput } from './dto/create-riskAssessment.dto';
import { evaluateRuleSet } from './ruleSet.client';
import { resolveRiskGradeLookupId } from './lookup.client';
import { pushRiskConditionSummary } from './beneficiaryRiskSummary.client';
import { generateHrVisitSchedule } from './visitScheduleGenerate.client';
import { BeneficiaryClient } from '../referrals/beneficiary.client';
import { listSakhiIdsForSupervisor } from '../referrals/sakhi.client';

/**
 * The only risk phases an HR visit can ever be generated for (SRS FR-S-5.3;
 * BR-06/SR-NN-01 explicitly forbids HR visits in the neonatal phase, and
 * REGISTRATION/DELIVERY/PP have no HR-visit concept of their own — see
 * hr.rulesJson.ts's own phase guard, which this list mirrors).
 */
const HR_VISIT_ELIGIBLE_PHASES = new Set(['ANC', 'INC', 'CCV']);

/**
 * Maps RiskCondition.phase (this service's own RiskPhase enum) to
 * beneficiary-service's SummaryPhase enum — the two aren't 1:1: RiskPhase
 * has INC/CCV where SummaryPhase groups the same infant-tracking period as
 * INFANT_FOLLOWUP/CLOSURE (matching CasePhase's own NN/INC/CCV naming
 * elsewhere in the SRS's case-phase model).
 */
const RISK_PHASE_TO_SUMMARY_PHASE: Record<string, string> = {
  REGISTRATION: 'REGISTRATION',
  ANC: 'ANC',
  DELIVERY: 'DELIVERY',
  PP: 'PP',
  NN: 'NN',
  INC: 'INFANT_FOLLOWUP',
  CCV: 'CLOSURE',
};

/**
 * Orchestrates the risk-grading write pipeline: evaluate the submission's
 * answers against the form's rule set (rules-service), persist the
 * RiskAssessment/RiskFlag source-of-truth rows (this service's own tables),
 * then push the derived per-condition rollup to beneficiary-service. Called
 * server-to-server by visit-form-service after it persists a visit-linked,
 * VALID form submission.
 */
export class RiskAssessmentService {
  constructor(
    private readonly repository: RiskAssessmentRepository,
    private readonly beneficiaryClient: BeneficiaryClient = new BeneficiaryClient(),
  ) {}

  /**
   * Idempotent by submissionId (@unique on risk_assessments) — a retried
   * visit-form-service call (dropped connection) returns the original
   * assessment instead of re-evaluating and double-writing, mirroring
   * beneficiary_cases.localCaseUuid/form_submissions.localSubmissionUuid.
   *
   * The rules-service evaluate call and the RiskAssessment/RiskFlag write
   * happen together, or not at all — a rules-service failure never leaves a
   * partial write (see riskAssessment.repository.ts's single transaction).
   * The follow-up push to beneficiary-service happens only after that write
   * has already committed, and its failure never rolls anything back — it
   * is a best-effort push of a derived, non-source-of-truth rollup (see
   * beneficiaryRiskSummary.client.ts).
   *
   * IDOR guard: this route is gated by requireRoles('SAKHI') (this codebase
   * has no machine/service-account identity — the call forwards the
   * originating SAKHI's own token), but dto.beneficiaryId is caller-supplied
   * and was previously never checked against the caller's own identity —
   * any authenticated SAKHI could evaluate/write a risk assessment for any
   * beneficiary. Mirrors ReferralService.decide's ownership check exactly:
   * a SAKHI may only act on her own beneficiary, a SUPERVISOR only on a
   * beneficiary whose Sakhi is in her roster, MANAGER/ADMIN unrestricted.
   */
  async create(
    dto: CreateRiskAssessmentInput,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const beneficiary = await this.beneficiaryClient.getById(
      dto.beneficiaryId,
      authorizationHeader,
    );
    if (!beneficiary) throw notFound('Beneficiary case not found.');

    if (caller.roles.includes('SAKHI')) {
      if (beneficiary.sakhiId !== caller.id) {
        throw forbidden('This beneficiary case is outside your own roster.');
      }
    } else if (caller.roles.includes('SUPERVISOR')) {
      if (!caller.projectId) {
        throw forbidden('Supervisor caller has no project scope.');
      }
      const roster = await listSakhiIdsForSupervisor(
        caller.projectId,
        caller.id,
        authorizationHeader,
      );
      if (!roster.includes(beneficiary.sakhiId)) {
        throw forbidden("This beneficiary case is outside this Supervisor's roster.");
      }
    }

    const existing = await this.repository.findBySubmissionId(dto.submissionId);
    if (existing) return existing;

    // Resolve conditionCode -> risk_condition_id (a rule pack's decision
    // graph output must carry a real DB id, see ruleSet.evaluator.ts's
    // RiskEvaluationResult contract, but the pack itself only knows portable
    // condition codes) and the "only first instance" flagging history
    // concurrently — findEverFlaggedConditionCodes doesn't depend on
    // conditionCodes at all, so it need not wait on findConditionIdsByPhase
    // (see PR #172 review: these were previously sequenced with no
    // dependency between them).
    const [conditionIdsByCode, everFlaggedCodes] = await Promise.all([
      this.repository.findConditionIdsByPhase(dto.riskPhase),
      this.repository.findEverFlaggedConditionCodes(dto.beneficiaryId),
    ]);
    if (conditionIdsByCode.size === 0) {
      throw badRequest(
        `No ACTIVE risk_conditions rows are seeded for phase "${dto.riskPhase}" — the rule ` +
          'pack has no conditionIds to grade against.',
      );
    }
    const conditionCodes = [...conditionIdsByCode.keys()];
    // The "3 consecutive visits with no improvement" streak (infant
    // nutrition conditions, Appendix D §2.4) genuinely needs conditionCodes,
    // so it can only start once findConditionIdsByPhase resolves. It's also
    // only read by infant-risk.rulesJson.ts — skip the query entirely for
    // ANC/REGISTRATION/DELIVERY/PP, whose rule packs never read it (see
    // PR #172 review: it was previously called unconditionally on every
    // phase, adding an unused DB round trip per submission).
    const NO_IMPROVEMENT_PHASES = new Set(['NN', 'INC', 'CCV']);
    const consecutiveNoImprovementByCode = NO_IMPROVEMENT_PHASES.has(dto.riskPhase)
      ? await this.repository.findConsecutiveNoImprovementCount(dto.beneficiaryId, conditionCodes)
      : new Map<string, number>();
    const conditionIds = Object.fromEntries(conditionIdsByCode);
    const isFirstInstance = Object.fromEntries(
      conditionCodes.map((code) => [code, !everFlaggedCodes.has(code)]),
    );
    const consecutiveNoImprovementCount = Object.fromEntries(consecutiveNoImprovementByCode);
    // Reverse of conditionIdsByCode — the push loop below only has each
    // condition's riskConditionId (from evaluation.conditions), but
    // isFirstInstance/consecutiveNoImprovementByCode above are keyed by
    // conditionCode (what the rule pack itself understands).
    const conditionCodeById = new Map([...conditionIdsByCode].map(([code, id]) => [id, code]));

    const evaluation = await evaluateRuleSet(
      dto.ruleSetId,
      { ...dto.answers, conditionIds, isFirstInstance, consecutiveNoImprovementCount },
      authorizationHeader,
    );

    const flags: RiskFlagCreateData[] = [];
    for (const condition of evaluation.conditions) {
      const riskGradeLookupValueId = await resolveRiskGradeLookupId(
        condition.grade,
        authorizationHeader,
      );
      if (!riskGradeLookupValueId) {
        throw badRequest(
          `The rule pack returned grade "${condition.grade}" for risk condition ` +
            `${condition.riskConditionId}, which is not a recognized RISK_GRADE value.`,
        );
      }
      flags.push({
        riskConditionId: condition.riskConditionId,
        riskGradeLookupValueId,
        gradeRank: condition.gradeRank,
        // Untyped external JSON (from rules-service's evaluate response)
        // crossing into Prisma's InputJsonValue at this one boundary.
        observedValueJson: condition.observedValueJson as Prisma.InputJsonValue | null,
        isReferralTrigger: condition.isReferralTrigger,
        isEducationTrigger: condition.isEducationTrigger,
        isHrVisitTrigger: condition.isHrVisitTrigger,
      });
    }

    const evaluatedAt = new Date();
    const hrDetectedFlag = evaluation.conditions.some((c) => c.isHrVisitTrigger);
    const overallHighRiskFlag = ['HIGH', 'CRITICAL'].includes(evaluation.overallRiskCategory);

    const assessment = await this.repository.create({
      beneficiaryId: dto.beneficiaryId,
      visitId: dto.visitId,
      submissionId: dto.submissionId,
      ruleVersionId: evaluation.ruleVersionId,
      evaluatedAt,
      overallRiskCategory: evaluation.overallRiskCategory,
      overallHighRiskFlag,
      hrDetectedFlag,
      flags,
    });

    // Best-effort HR visit generation (SRS FR-S-5.2(b)) — only when this
    // evaluation actually detected an HR condition, the phase can carry an
    // HR visit at all (HR_VISIT_ELIGIBLE_PHASES), and the caller supplied
    // the visit's actual completion date (older/other callers that omit it
    // simply don't get this trigger — no HR-visit generation was ever
    // wired up for them before this, so this is strictly additive).
    // Failure here must never roll back or fail the already-committed
    // RiskAssessment/RiskFlag write above.
    if (hrDetectedFlag && HR_VISIT_ELIGIBLE_PHASES.has(dto.riskPhase) && dto.actualCompletionDate) {
      const result = await generateHrVisitSchedule(
        dto.beneficiaryId,
        {
          phase: dto.riskPhase as 'ANC' | 'INC' | 'CCV',
          hrDetectedThisVisit: true,
          actualCompletionDate: dto.actualCompletionDate,
        },
        authorizationHeader,
      );
      if (!result.ok) {
        console.error(
          `Failed to generate HR visit schedule for beneficiary ${dto.beneficiaryId} ` +
            `(assessment ${assessment.id}): ${result.error}`,
        );
      }
    }

    // Best-effort push per distinct condition — failures are logged and
    // swallowed (see beneficiaryRiskSummary.client.ts's doc comment); the
    // RiskAssessment/RiskFlag write above has already committed regardless.
    const phaseByConditionId = await this.repository.findPhasesByConditionIds(
      evaluation.conditions.map((c) => c.riskConditionId),
    );
    for (const condition of evaluation.conditions) {
      const riskPhase = phaseByConditionId.get(condition.riskConditionId);
      const summaryPhase = riskPhase ? RISK_PHASE_TO_SUMMARY_PHASE[riskPhase] : undefined;
      if (!summaryPhase) {
        console.error(
          `Risk condition ${condition.riskConditionId} has no resolvable phase — skipping ` +
            `risk-condition-summary push for beneficiary ${dto.beneficiaryId}.`,
        );
        continue;
      }
      const conditionCode = conditionCodeById.get(condition.riskConditionId);
      if (!conditionCode) {
        // conditionCode is expected to always be resolvable here
        // (evaluation.conditions' riskConditionIds all originate from
        // conditionIdsByCode, which conditionCodeById is the exact reverse
        // of) — if this is ever hit (e.g. a stale/mismatched rule-pack
        // version returning a riskConditionId outside the current phase's
        // active condition set), isFirstInstance/consecutiveNoImprovementCount
        // cannot be looked up at all. Skipping the push (same as the
        // unresolvable-phase branch above) rather than guessing
        // isFirstInstance: true is deliberate: a silent wrong guess could
        // misreport a long-standing chronic condition as a first instance,
        // with real behavioral consequences (referral/education triggers
        // gate on this) — a loud skip is safer than a silent wrong value
        // (PR #199 review).
        console.error(
          `Risk condition ${condition.riskConditionId} has no resolvable conditionCode — ` +
            `skipping risk-condition-summary push for beneficiary ${dto.beneficiaryId}.`,
        );
        continue;
      }
      const result = await pushRiskConditionSummary(
        dto.beneficiaryId,
        {
          riskConditionId: condition.riskConditionId,
          phase: summaryPhase,
          grade: condition.grade,
          gradeRank: condition.gradeRank,
          observedValueJson: condition.observedValueJson,
          visitId: dto.visitId,
          submissionId: dto.submissionId,
          assessedAt: evaluatedAt.toISOString(),
          isReferralTrigger: condition.isReferralTrigger,
          isHrVisitTrigger: condition.isHrVisitTrigger,
          ruleVersionId: evaluation.ruleVersionId,
          isFirstInstance: isFirstInstance[conditionCode],
          consecutiveNoImprovementCount: consecutiveNoImprovementCount[conditionCode] ?? null,
        },
        authorizationHeader,
      );
      if (!result.ok) {
        // Matches closure.service.ts's console.error precedent for a
        // best-effort side-call failure — no shared structured logger is
        // threaded into this service layer today.
        console.error(
          `Failed to push risk-condition-summary for beneficiary ${dto.beneficiaryId}, ` +
            `condition ${condition.riskConditionId}: ${result.error}`,
        );
      }
    }

    return assessment;
  }

  /**
   * The RiskAssessment rows for a caller-resolved set of visit ids — used by
   * visit-form-service's BR-13 (CCV opening risk state) resolver, which
   * already knows which visit ids are "the last 3 completed INC visits" (it
   * owns visit_instances/visit_schedules; this service doesn't, no
   * cross-service join per the forklift rule). An empty `visitIds` returns
   * an empty array without querying.
   *
   * Same IDOR guard as create(): beneficiaryId is caller-supplied, so
   * without this check any authenticated SAKHI could read another
   * beneficiary's risk assessments by visit id. Mirrors create()'s
   * ownership check exactly (SAKHI own-case only, SUPERVISOR own-roster
   * only, MANAGER/ADMIN unrestricted).
   */
  async listByVisitIds(
    beneficiaryId: string,
    visitIds: string[],
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const beneficiary = await this.beneficiaryClient.getById(beneficiaryId, authorizationHeader);
    if (!beneficiary) throw notFound('Beneficiary case not found.');

    if (caller.roles.includes('SAKHI')) {
      if (beneficiary.sakhiId !== caller.id) {
        throw forbidden('This beneficiary case is outside your own roster.');
      }
    } else if (caller.roles.includes('SUPERVISOR')) {
      if (!caller.projectId) {
        throw forbidden('Supervisor caller has no project scope.');
      }
      const roster = await listSakhiIdsForSupervisor(
        caller.projectId,
        caller.id,
        authorizationHeader,
      );
      if (!roster.includes(beneficiary.sakhiId)) {
        throw forbidden("This beneficiary case is outside this Supervisor's roster.");
      }
    }

    return this.repository.findByVisitIds(beneficiaryId, visitIds);
  }
}
