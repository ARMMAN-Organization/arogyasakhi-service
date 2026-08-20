// Read directly (not via appConfig) — matches geography.client.ts/
// socio-demographics.client.ts's stance in this service.
const API_GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

/**
 * Triggers risk evaluation for a visit-linked, VALID submission by calling
 * risk-referral-service's `POST /risk-assessments`, which evaluates the
 * submission's answers against the form's rule set, persists
 * RiskAssessment/RiskFlag, and pushes the rollup to beneficiary-service.
 *
 * Best-effort by design, matching syncSocioDemographics's stance: the
 * submission itself is already durably saved by the time this runs, and
 * losing a risk-grading pass is recoverable (the next visit/submission for
 * this beneficiary+condition re-evaluates) — rejecting a completed
 * submission in the field over a downstream evaluation failure is not
 * acceptable.
 */
export async function triggerRiskAssessment(
  input: {
    beneficiaryId: string;
    visitId: string | null;
    submissionId: string;
    ruleSetId: string;
    // The RiskCondition.phase this submission's form corresponds to (e.g.
    // 'ANC' for ANC_VISIT) — risk-referral-service has no other way to know
    // which risk_conditions rows a given ruleSetId's decision graph refers
    // to (RuleSet itself carries no phase), so the caller (this service,
    // which already owns formCode -> phase knowledge) supplies it.
    riskPhase: string;
    answers: Record<string, unknown>;
  },
  authorizationHeader: string,
): Promise<void> {
  try {
    const res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/risk-assessments`, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      console.warn(
        `Failed to trigger risk assessment for submission ${input.submissionId} ` +
          `(risk-referral-service returned ${res.status}); the submission itself was still saved.`,
      );
    }
  } catch (err) {
    console.warn(
      `Unable to reach risk-referral-service to evaluate submission ${input.submissionId}; ` +
        `the submission itself was still saved. ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

interface RiskAssessmentSummary {
  visitId: string | null;
  overallRiskCategory: 'NORMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  overallHighRiskFlag: boolean;
  hrDetectedFlag: boolean;
}

/**
 * Fetches the RiskAssessment rows for a given visit-id batch via
 * risk-referral-service's `GET /risk-assessments?beneficiaryId=&visitIds=`
 * — used by ccvOpeningRiskState.resolver.ts's BR-13 computation, which
 * already knows which visit ids it cares about (this service owns visit
 * typing; risk-referral-service doesn't, no cross-service join per the
 * forklift rule).
 *
 * Returns `null` (not an empty array) on any failure — degrade, don't
 * throw: BR-13's opening-risk-state write is itself best-effort (see
 * ccvOpeningRiskState.resolver.ts), and a transient risk-referral-service
 * blip should skip that one computation, not surface as an error anywhere
 * in the CHILD phase-advance flow. An empty `visitIds` short-circuits to an
 * empty array without a network call.
 */
export async function listRiskAssessments(
  beneficiaryId: string,
  visitIds: string[],
  authorizationHeader: string,
): Promise<RiskAssessmentSummary[] | null> {
  if (visitIds.length === 0) return [];

  try {
    const res = await fetch(
      `${API_GATEWAY_BASE_URL}/api/v1/risk-assessments?beneficiaryId=${beneficiaryId}&visitIds=${visitIds.join(',')}`,
      { headers: { Authorization: authorizationHeader } },
    );
    if (!res.ok) {
      console.warn(
        `Failed to list risk assessments for beneficiary ${beneficiaryId} ` +
          `(risk-referral-service returned ${res.status}).`,
      );
      return null;
    }
    const body = (await res.json()) as { data: RiskAssessmentSummary[] };
    return body.data;
  } catch (err) {
    console.warn(
      `Unable to reach risk-referral-service to list risk assessments for beneficiary ` +
        `${beneficiaryId}. ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
