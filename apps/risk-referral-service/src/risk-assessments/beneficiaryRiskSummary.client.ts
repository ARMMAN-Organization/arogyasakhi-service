/**
 * Pushes one condition's rollup to beneficiary-service's
 * `PATCH /beneficiaries/:id/risk-condition-summary` through the gateway,
 * forwarding the caller's own Authorization header. Deliberately does not
 * throw on failure — this push is best-effort enrichment of a derived,
 * non-source-of-truth table (see the ERD's derivation note); a failure here
 * must never roll back or fail the RiskAssessment/RiskFlag write that
 * already committed. The caller logs the outcome and moves on — no
 * retry/reconciliation exists in this codebase (confirmed: zero event/queue
 * infrastructure anywhere), an accepted known gap for this milestone.
 */
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

export interface RiskConditionSummaryPush {
  riskConditionId: string;
  phase: string;
  grade: string;
  gradeRank: number;
  observedValueJson: Record<string, unknown> | null;
  visitId: string | null;
  submissionId: string | null;
  assessedAt: string;
  isReferralTrigger: boolean;
  isHrVisitTrigger: boolean;
  ruleVersionId: string | null;
  /** Whether this is the first time this condition has ever been flagged
   * (non-NORMAL grade) for this beneficiary, as of this specific grading
   * pass — the same isFirstInstance value fed as a rule-pack evaluation
   * input, not recomputed. */
  isFirstInstance: boolean;
  /** Length of the current "no improvement" streak (consecutive gradings
   * with a non-decreasing gradeRank) for this condition, for phases that
   * track it (NN/INC/CCV) — null for phases where this concept doesn't
   * apply (ANC/REGISTRATION/DELIVERY/PP). */
  consecutiveNoImprovementCount: number | null;
}

export async function pushRiskConditionSummary(
  beneficiaryId: string,
  data: RiskConditionSummaryPush,
  authorizationHeader: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(
      `${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}/risk-condition-summary`,
      {
        method: 'PATCH',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, error: body?.message ?? `beneficiary-service returned ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}
