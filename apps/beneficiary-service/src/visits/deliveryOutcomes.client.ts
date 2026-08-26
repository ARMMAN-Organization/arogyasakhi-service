import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — see visitVitals.client.ts's own note on why.
const VISIT_FORM_SERVICE_BASE_URL =
  process.env.VISIT_FORM_SERVICE_BASE_URL ?? 'http://localhost:3000';

/**
 * Delivery outcomes that mean the child was NOT live-born — matches
 * visit-form-service's resolveDeliveryChildren's own `outcome !==
 * 'live_birth'` guard, kept as an explicit allowlist here (rather than
 * `!== 'live_birth'`) so a new non-stillbirth outcome value added to the
 * DELIVERY_VISIT form in the future doesn't silently start blocking CHILD
 * creation for an outcome nobody intended to be a stillbirth.
 */
const STILLBIRTH_OUTCOMES = new Set([
  'antepartum_still_birth_fresh',
  'intrapartum_still_birth_macerated',
]);

export interface DeliveryOutcomeBySlot {
  birthOrder: number;
  outcome: string;
}

/** True if a given outcome value_code means the child was NOT live-born. */
export function isStillbirthOutcome(outcome: string): boolean {
  return STILLBIRTH_OUTCOMES.has(outcome);
}

/**
 * Resolves a mother's most recent DELIVERY_VISIT per-slot outcomes via
 * visit-form-service's `GET /beneficiaries/:beneficiaryId/delivery-outcomes`
 * (called through the gateway, per VISIT_FORM_SERVICE_BASE_URL, same
 * pattern as visitVitals.client.ts). Returns the raw per-slot outcomes,
 * each tagged with its own birthOrder, so the caller (BeneficiaryService
 * .create) can check the SPECIFIC slot a CHILD-creation request is for —
 * not a count comparison, which was order-dependent and could wrongly
 * block a live-born twin/triplet if a stillborn sibling's slot happened to
 * be registered first. Unlike visitVitals.client.ts's degrade-to-null
 * stance, this one throws (badGateway) on any failure — this exists to
 * BLOCK creating a duplicate CHILD record for an already-stillborn child;
 * silently treating an unreachable visit-form-service as "no stillbirth"
 * would defeat the safety check.
 */
export async function resolveDeliveryOutcomesBySlot(
  motherBeneficiaryId: string,
  authorizationHeader: string,
): Promise<DeliveryOutcomeBySlot[]> {
  let res: Response;
  try {
    res = await fetch(
      `${VISIT_FORM_SERVICE_BASE_URL}/api/v1/beneficiaries/${motherBeneficiaryId}/delivery-outcomes`,
      { headers: { Authorization: authorizationHeader } },
    );
  } catch {
    throw badGateway('Unable to verify delivery outcomes — visit-form-service is unreachable.');
  }

  if (!res.ok) {
    throw badGateway('Unable to verify delivery outcomes — visit-form-service returned an error.');
  }

  const body = (await res.json()) as { data: { outcomes: DeliveryOutcomeBySlot[] } };
  return body.data.outcomes;
}
