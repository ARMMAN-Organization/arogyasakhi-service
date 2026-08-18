import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — matches create-child.client.ts's/lookup.client.ts's stance.
const API_GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

interface LookupValue {
  id: string;
  valueCode: string;
}

interface LookupCategory {
  categoryCode: string;
  values: LookupValue[];
}

/**
 * Maps ANC_CLOSURE_VISIT's/CHILD_CLOSURE_VISIT's `closure_reason` field
 * value_codes (snake_case, per the seeded form schema) to the
 * CLOSURE_REASON lookup category's own valueCodes (SCREAMING_SNAKE) — the
 * two vocabularies were authored independently and don't match by simple
 * case transform (e.g. `abortion_spontaneous_induced_mtp` -> `ABORTION`,
 * `infant_child_death` -> `INFANT_OR_CHILD_DEATH`).
 */
const FORM_REASON_TO_LOOKUP_CODE: Record<string, string> = {
  withdrawal_of_consent: 'WITHDRAWAL',
  miscarriage: 'MISCARRIAGE',
  abortion_spontaneous_induced_mtp: 'ABORTION',
  migration: 'MIGRATION',
  program_cycle_completed: 'PROGRAM_CYCLE_COMPLETED',
  maternal_death: 'MATERNAL_DEATH',
  infant_child_death: 'INFANT_OR_CHILD_DEATH',
};

/**
 * Resolves a closure form's `closure_reason` answer to a
 * closure_reason_lookup_value_id, for POST /closures' required field —
 * returns null (not a throw) for an unrecognized reason, so the caller can
 * skip auto-closure rather than fail an already-valid form submission over
 * a mapping gap.
 */
export async function resolveClosureReasonLookupId(
  formReasonCode: string,
  authorizationHeader: string,
): Promise<string | null> {
  const lookupCode = FORM_REASON_TO_LOOKUP_CODE[formReasonCode];
  if (!lookupCode) return null;

  let res: Response;
  try {
    res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/lookups/CLOSURE_REASON`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve the closure reason — auth-service is unreachable.');
  }
  if (!res.ok) {
    throw badGateway('Unable to resolve the closure reason — auth-service returned an error.');
  }

  const body = (await res.json()) as { data: LookupCategory };
  return body.data.values.find((v) => v.valueCode === lookupCode)?.id ?? null;
}

export interface CreateClosureInput {
  localClosureUuid: string;
  beneficiaryId: string;
  closureType: 'MEDICAL' | 'NON_MEDICAL' | 'PROGRAM_COMPLETION';
  closureReasonLookupValueId: string;
  eventDate?: string;
  closureDate: string;
  submittedByUserId: string;
  supervisorStatus?: 'PENDING';
}

/**
 * Creates a closure via closure-reopen-service's POST /closures, called
 * automatically after an ANC_CLOSURE_VISIT/CHILD_CLOSURE_VISIT submission
 * (with continue_with_closure: 'yes') — closes the loop the SRS's closure
 * flow otherwise leaves open: submitting the form alone has no effect on
 * the beneficiary's own record without this call.
 *
 * Best-effort by design, matching createChildBeneficiary/updateBeneficiaryPhase:
 * the closure submission's own form data is already durably saved by the
 * time this runs. A failure here is logged and swallowed rather than
 * failing the Sakhi's submission.
 */
export async function createClosure(
  input: CreateClosureInput,
  authorizationHeader: string,
): Promise<void> {
  try {
    const res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/closures`, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      console.warn(
        `Failed to auto-create closure for beneficiary ${input.beneficiaryId} ` +
          `(closure-reopen-service returned ${res.status}); the closure-form submission itself was still saved.`,
      );
    }
  } catch (err) {
    console.warn(
      `Unable to reach closure-reopen-service to auto-create closure for beneficiary ` +
        `${input.beneficiaryId}; the closure-form submission itself was still saved. ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
