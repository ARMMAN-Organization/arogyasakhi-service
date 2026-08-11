// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — mirrors sakhi.client.ts's convention.
const GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

/**
 * Triggers ANC schedule regeneration in visit-form-service after an
 * approved LMP/EDD change (FR-SV-4.2) — via
 * `POST /visit-schedules/regenerate-anc`, called through the gateway with
 * the original caller's own bearer token forwarded unchanged.
 *
 * Deliberately does not throw on failure — same best-effort shape as
 * risk-referral-service's pushRiskConditionSummary: the LMP/EDD write
 * itself must succeed regardless of whether regeneration does, since no
 * retry/reconciliation mechanism exists anywhere in this codebase yet. The
 * caller logs the outcome and moves on.
 */
export async function regenerateAncSchedule(
  beneficiaryId: string,
  registrationDate: string,
  edd: string,
  authorizationHeader: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(`${GATEWAY_BASE_URL}/api/v1/visit-schedules/regenerate-anc`, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ beneficiaryId, registrationDate, edd }),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      return { ok: false, error: body?.message ?? `visit-form-service returned ${res.status}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'unknown error' };
  }
}
