// Read directly (not via appConfig) — matches ruleVersion.client.ts's stance.
const GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

/**
 * Calls rules-service's `POST /rules/:setId/evaluate-schedule` through the
 * gateway — used by ccvOpeningRiskState.resolver.ts to run the seeded CCV
 * schedule pack (ccv.rulesJson.ts) and read back its `riskState` output.
 *
 * Returns `null` (not a thrown error) on any failure — same degrade-not-fail
 * stance as listRiskAssessments: BR-13's write is best-effort, a transient
 * rules-service blip should skip the computation for this visit, not error
 * the CHILD phase-advance flow that triggered it.
 */
export async function evaluateSchedule(
  ruleSetId: string,
  scheduleKind: string,
  input: Record<string, unknown>,
  authorizationHeader: string,
): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/rules/${ruleSetId}/evaluate-schedule`, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleKind, input }),
    });
    if (!res.ok) {
      console.warn(
        `Failed to evaluate ${scheduleKind} schedule pack ${ruleSetId} ` +
          `(rules-service returned ${res.status}).`,
      );
      return null;
    }
    const body = (await res.json()) as { data: Record<string, unknown> };
    return body.data;
  } catch (err) {
    console.warn(
      `Unable to reach rules-service to evaluate ${scheduleKind} schedule pack ${ruleSetId}. ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
