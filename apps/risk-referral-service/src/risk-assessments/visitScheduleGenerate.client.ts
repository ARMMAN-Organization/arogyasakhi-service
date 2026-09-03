/**
 * Triggers server-side HR visit generation via visit-form-service's
 * `POST /visit-schedules/generate` (scheduleKind 'HR') through the gateway,
 * forwarding the caller's own Authorization header — per SRS FR-S-5.2(b):
 * "generates an HR visit 15 days from the ACTUAL completion date after the
 * form is filled out", a server-triggered action, not something the client
 * separately requests. Called from riskAssessment.service.ts's create()
 * right after RiskAssessment/RiskFlag persist, when hrDetectedFlag is true.
 *
 * Deliberately does not throw on failure — same rationale as
 * beneficiaryRiskSummary.client.ts: this is a downstream side effect of an
 * already-committed RiskAssessment/RiskFlag write, which must never be
 * rolled back or fail because visit-form-service is unreachable. The
 * caller logs the outcome and moves on.
 */
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

export interface HrVisitScheduleInput {
  phase: 'ANC' | 'INC' | 'CCV';
  hrDetectedThisVisit: boolean;
  /** Date-only string (YYYY-MM-DD) — visit-form-service's dateOnlySchema. */
  actualCompletionDate: string;
}

export async function generateHrVisitSchedule(
  beneficiaryId: string,
  input: HrVisitScheduleInput,
  authorizationHeader: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/visit-schedules/generate`, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ beneficiaryId, scheduleKind: 'HR', ...input }),
    });
    if (!res.ok) {
      return { ok: false, error: `visit-form-service returned ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
