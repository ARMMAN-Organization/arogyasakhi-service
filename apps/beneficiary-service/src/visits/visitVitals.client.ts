// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — see riskCondition.client.ts's own note on why.
const VISIT_FORM_SERVICE_BASE_URL =
  process.env.VISIT_FORM_SERVICE_BASE_URL ?? 'http://localhost:3000';

export interface VitalsSnapshot {
  visitId: string | null;
  submittedAt: string | null;
  weightKg: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  temperatureF: number | null;
  hemoglobinGDl: number | null;
  muacCm: number | null;
  respiratoryRate: number | null;
}

/**
 * Resolves a beneficiary's most recent visit's vitals via visit-form-
 * service's `GET /beneficiaries/:beneficiaryId/latest-visit-vitals` (called
 * through the gateway, per VISIT_FORM_SERVICE_BASE_URL, so the gateway can
 * verify `authorizationHeader` — the original caller's own bearer token,
 * forwarded unchanged, same pattern as riskCondition.client.ts). Used to
 * enrich `GET /beneficiaries/:id` with `lastVisitVitals`, since
 * beneficiary-service owns no visit/form data itself (no cross-service
 * joins, per this service's forklift rule).
 *
 * Returns `null` (not thrown) on any failure — degrade, don't fail: the
 * beneficiary's own case/PII/risk data is more load-bearing than the last
 * visit's vitals, same stance as resolveRiskConditions.
 */
export async function resolveLatestVisitVitals(
  beneficiaryId: string,
  authorizationHeader: string,
): Promise<VitalsSnapshot | null> {
  try {
    const res = await fetch(
      `${VISIT_FORM_SERVICE_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}/latest-visit-vitals`,
      { headers: { Authorization: authorizationHeader } },
    );
    if (!res.ok) {
      console.warn(
        `Failed to resolve latest-visit-vitals for beneficiary ${beneficiaryId} — ` +
          `visit-form-service returned ${res.status}.`,
      );
      return null;
    }
    const body = (await res.json()) as { data: VitalsSnapshot };
    return body.data;
  } catch (err) {
    console.warn(
      `Unable to reach visit-form-service to resolve latest-visit-vitals for beneficiary ` +
        `${beneficiaryId}.`,
      err,
    );
    return null;
  }
}
