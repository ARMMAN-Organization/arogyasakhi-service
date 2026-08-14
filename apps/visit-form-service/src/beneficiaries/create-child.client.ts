import type { BeneficiaryCase } from './beneficiary.client';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — matches geography.client.ts's/socio-demographics.client.ts's stance.
const API_GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

export interface CreateChildBeneficiaryInput {
  /** The delivering mother's own case — its projectId/beneficiaryTypeLookupId/
   * caseTypeLookupId are reused for the new child case rather than this
   * service guessing or re-resolving them. */
  motherCase: BeneficiaryCase;
  /** Client-generated, per-child idempotency key — see localCaseUuid in
   * beneficiary-service's createBeneficiarySchema. Guards only against a
   * dropped-connection retry of this specific HTTP call landing twice (see
   * findByLocalCaseUuid in beneficiary.repository.ts); it does NOT give the
   * Delivery submission itself a retry path — a resubmit of the same form
   * never reaches this call again, so a failure here is a genuine one-shot
   * best-effort attempt (see form.service.ts's DELIVERY_VISIT branch). */
  localCaseUuid: string;
  registrationDate: Date;
  dateOfBirth: Date;
  sex?: 'MALE' | 'FEMALE' | 'INTERSEX_OTHER';
  birthWeightKg?: number;
  birthLengthCm?: number;
}

/**
 * Creates a CHILD beneficiary case for one live-born child from a
 * DELIVERY_VISIT submission, via beneficiary-service's existing
 * `POST /beneficiaries` — no beneficiary-service changes needed, that
 * endpoint already accepts everything a Delivery-form child needs
 * (caseType: 'CHILD', motherBeneficiaryId set).
 *
 * Best-effort by design, matching syncSocioDemographics/triggerRiskAssessment:
 * the Delivery submission itself is already durably saved by the time this
 * runs. A failure here is logged and swallowed rather than failing the
 * Sakhi's submission — a missing child profile is a follow-up/ops concern,
 * rejecting a completed delivery record in the field is not.
 */
export async function createChildBeneficiary(
  input: CreateChildBeneficiaryInput,
  authorizationHeader: string,
): Promise<void> {
  const body = {
    // No name/phone is captured on the Delivery form for the newborn — the
    // Infant Registration (CHILD_REGISTRATION) form is where a Sakhi later
    // fills those in; this call only needs to exist so scheduling
    // (NN/INC visit generation) and later registration have a beneficiary
    // case row to attach to.
    pii: {
      fullName: 'Unnamed',
      phone: '0000000000',
      dateOfBirth: input.dateOfBirth.toISOString(),
      sex: input.sex,
      villageId: input.motherCase.villageId,
      padaId: input.motherCase.padaId,
      healthSubCentreId: input.motherCase.healthSubCentreId,
      phcId: input.motherCase.phcId,
      stateId: input.motherCase.stateId,
      districtId: input.motherCase.districtId,
    },
    case: {
      localCaseUuid: input.localCaseUuid,
      projectId: input.motherCase.projectId,
      caseType: 'CHILD',
      registrationDate: input.registrationDate.toISOString(),
      motherBeneficiaryId: input.motherCase.id,
      beneficiaryTypeLookupId: input.motherCase.beneficiaryTypeLookupId,
      caseTypeLookupId: input.motherCase.caseTypeLookupId,
    },
    childDetails: {
      dateOfBirth: input.dateOfBirth.toISOString(),
      sex: input.sex,
      birthWeightKg: input.birthWeightKg,
      birthLengthCm: input.birthLengthCm,
    },
    consent: {
      status: 'GIVEN',
      date: input.registrationDate.toISOString(),
    },
    // The Delivery form has already confirmed the birth details (outcome,
    // sex, weight) for this specific child — beneficiary-service's
    // same-mother/same-DOB duplicate check would otherwise 409 on the
    // second child of a twin/triplet delivery (identical dateOfBirth,
    // same motherBeneficiaryId), which is not a real duplicate here.
    acknowledgeDuplicate: true,
  };

  try {
    const res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/beneficiaries`, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(
        `Failed to auto-create child beneficiary for mother ${input.motherCase.id} ` +
          `(beneficiary-service returned ${res.status}); the Delivery submission itself was still saved.`,
      );
    }
  } catch (err) {
    console.warn(
      `Unable to reach beneficiary-service to auto-create child beneficiary for mother ` +
        `${input.motherCase.id}; the Delivery submission itself was still saved. ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
