// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — matches create-child.client.ts's/geography.client.ts's stance.
const API_GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

/**
 * Advances a beneficiary case's currentPhase via beneficiary-service's
 * `PATCH /beneficiaries/:id/phase` (CR-041) — called after a DELIVERY_VISIT
 * submission, once for the mother (phase: 'PP') and once per auto-created
 * child (phase: 'NN').
 *
 * Best-effort by design, same stance as createChildBeneficiary: the Delivery
 * submission (and any child case it created) is already durably saved by the
 * time this runs. A failure here is logged and swallowed rather than failing
 * the Sakhi's submission — a stale currentPhase is a follow-up/ops concern,
 * rejecting a completed delivery record in the field is not.
 */
export async function updateBeneficiaryPhase(
  beneficiaryId: string,
  phase: string,
  authorizationHeader: string,
): Promise<void> {
  try {
    const res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}/phase`, {
      method: 'PATCH',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ phase }),
    });
    if (!res.ok) {
      console.warn(
        `Failed to advance currentPhase to ${phase} for beneficiary ${beneficiaryId} ` +
          `(beneficiary-service returned ${res.status}); the Delivery submission itself was still saved.`,
      );
    }
  } catch (err) {
    console.warn(
      `Unable to reach beneficiary-service to advance currentPhase to ${phase} for beneficiary ` +
        `${beneficiaryId}; the Delivery submission itself was still saved. ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

/**
 * Writes ChildCaseDetails.ccvOpeningRiskState (BR-13) via beneficiary-service's
 * `PATCH /beneficiaries/:id/ccv-opening-risk-state` — called once, right
 * after a successful updateBeneficiaryPhase(id, 'CCV', ...) call, by
 * ccvOpeningRiskState.resolver.ts.
 *
 * Best-effort by design, same stance as updateBeneficiaryPhase: the CHILD
 * case has already advanced to CCV by the time this runs, and BR-13's
 * opening risk state is a derived clinical-tracking value, not something
 * that should ever block or roll back a completed visit submission.
 */
export async function setCcvOpeningRiskState(
  beneficiaryId: string,
  ccvOpeningRiskState: string,
  authorizationHeader: string,
): Promise<void> {
  try {
    const res = await fetch(
      `${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}/ccv-opening-risk-state`,
      {
        method: 'PATCH',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ccvOpeningRiskState }),
      },
    );
    if (!res.ok) {
      console.warn(
        `Failed to set ccvOpeningRiskState to ${ccvOpeningRiskState} for beneficiary ` +
          `${beneficiaryId} (beneficiary-service returned ${res.status}).`,
      );
    }
  } catch (err) {
    console.warn(
      `Unable to reach beneficiary-service to set ccvOpeningRiskState for beneficiary ` +
        `${beneficiaryId}. ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
