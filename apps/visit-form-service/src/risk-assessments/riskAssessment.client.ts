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
