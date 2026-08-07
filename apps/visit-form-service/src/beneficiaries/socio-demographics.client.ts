// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — matches geography.client.ts's stance.
const API_GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

/**
 * The MOTHER_REGISTRATION question_codes whose answers beneficiary-service
 * owns as structured socio-demographic columns, mapped to the field names its
 * `PATCH /beneficiaries/:id/socio-demographics` body expects. Values are sent
 * as the form's own value_code strings — beneficiary-service resolves those to
 * lookup_values ids (it owns that mapping; we must not duplicate it here).
 */
const QUESTION_CODE_TO_FIELD: Record<string, string> = {
  who_owns_the_phone: 'phoneOwner',
  availability_of_mobile_network: 'mobileNetworkAvailability',
  what_is_the_highest_level_of_education_you_have_completed: 'educationLevel',
  what_is_the_highest_level_of_education_your_partner_have_completed: 'partnerEducationLevel',
  what_is_the_occupation_of_your_partner: 'partnerOccupation',
  which_of_the_following_best_describes_your_household_s_migration_pattern: 'migrationPattern',
  what_is_the_income_of_the_family_per_month: 'monthlyIncome',
  what_is_your_religion: 'religion',
  what_is_your_category: 'socialCategory',
};

/** Numeric socio-demographic answers — sent as numbers, no lookup involved. */
const NUMERIC_QUESTION_CODE_TO_FIELD: Record<string, string> = {
  since_when_have_you_been_staying_in_this_village: 'yearsInVillage',
  how_many_family_members_in_your_household_including_children_under_5_years_of_age:
    'familyMembersCount',
  how_many_children_under_5_years_of_age_are_in_your_household: 'childrenUnder5Count',
};

/**
 * Extracts the socio-demographic answers from a submitted formData payload,
 * in the shape beneficiary-service's upsert endpoint accepts. Returns null when
 * the submission answered none of them (nothing to sync).
 */
export function extractSocioDemographics(
  formData: Record<string, unknown>,
): Record<string, unknown> | null {
  const body: Record<string, unknown> = {};

  for (const [questionCode, field] of Object.entries(QUESTION_CODE_TO_FIELD)) {
    const value = formData[questionCode];
    if (typeof value === 'string' && value.trim() !== '') body[field] = value;
  }

  for (const [questionCode, field] of Object.entries(NUMERIC_QUESTION_CODE_TO_FIELD)) {
    const value = formData[questionCode];
    if (value === undefined || value === null || value === '') continue;
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) body[field] = numeric;
  }

  return Object.keys(body).length > 0 ? body : null;
}

/**
 * Pushes a MOTHER_REGISTRATION submission's socio-demographic answers to
 * beneficiary-service, which owns them as structured columns (the form re-asks
 * them so the Sakhi sees one continuous questionnaire).
 *
 * Best-effort by design: the submission itself is already durably saved by the
 * time this runs, and form_submissions.form_data_json keeps every answer
 * verbatim regardless. A failure here is logged and swallowed rather than
 * failing the Sakhi's submission — losing the structured projection is
 * recoverable, rejecting a completed registration in the field is not.
 */
export async function syncSocioDemographics(
  beneficiaryId: string,
  formData: Record<string, unknown>,
  authorizationHeader: string,
): Promise<void> {
  const body = extractSocioDemographics(formData);
  if (!body) return;

  try {
    const res = await fetch(
      `${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}/socio-demographics`,
      {
        method: 'PATCH',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      console.warn(
        `Failed to sync socio-demographics for beneficiary ${beneficiaryId} ` +
          `(beneficiary-service returned ${res.status}); the submission itself was still saved.`,
      );
    }
  } catch (err) {
    console.warn(
      `Unable to reach beneficiary-service to sync socio-demographics for ` +
        `beneficiary ${beneficiaryId}; the submission itself was still saved. ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
