// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — matches geography.client.ts's/
// socio-demographics.client.ts's stance.
const API_GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

/**
 * Q58's positive (diagnosed/treated) answer codes, mapped to the stable
 * risk_conditions.conditionCode seeded for each — negative/unknown codes
 * ("no_known_medical_condition", "don_t_know") are intentionally absent so
 * they never resolve to a condition.
 */
const DIAGNOSED_CONDITION_CODE_TO_RISK_CONDITION_CODE: Record<string, string> = {
  hypertension_high_bp: 'HYPERTENSION_HIGH_BP',
  diabetes_pre_gestational_diagnosed_before_pregnancy: 'DIABETES_PRE_GESTATIONAL',
  gestational_diabetes_in_previous_pregnancy: 'GESTATIONAL_DIABETES',
  thyroid_disorder: 'THYROID_DISORDER',
  heart_disease: 'HEART_DISEASE',
  epilepsy_seizure_disorder: 'EPILEPSY_SEIZURE_DISORDER',
  asthma_chronic_respiratory_disease: 'ASTHMA_CHRONIC_RESPIRATORY',
  kidney_disease: 'KIDNEY_DISEASE',
  thalassemia: 'THALASSEMIA',
  liver_disease: 'LIVER_DISEASE',
  anemia_severe_recurrent: 'ANEMIA_SEVERE_RECURRENT',
  tuberculosis_current_or_past: 'TUBERCULOSIS',
  hiv_aids: 'HIV_AIDS',
  hepatitis_b: 'HEPATITIS_B',
  mental_health_condition_e_g_depression_anxiety: 'MENTAL_HEALTH_CONDITION',
};

/** Q60's two positive (detected) answer codes, mapped the same way. */
const SICKLE_CELL_STATUS_CODE_TO_RISK_CONDITION_CODE: Record<string, string> = {
  sickle_cell_disease_scd: 'SICKLE_CELL_DISEASE',
  sickle_cell_trait_sct_carrier: 'SICKLE_CELL_TRAIT',
};

const Q58_QUESTION_CODE =
  'have_you_ever_been_diagnosed_with_or_treated_for_any_of_the_following_medical_conditions';
const Q60_QUESTION_CODE =
  'have_you_been_detected_with_sickle_cell_disease_or_sickle_cell_trait_sct';

/**
 * Extracts the risk_conditions.conditionCodes implied by a MOTHER_REGISTRATION
 * submission's Q58 (multiselect diagnosed/treated conditions) and Q60
 * (single-select sickle cell status) answers. Returns an empty array when
 * neither question was answered with a positive code — nothing to sync.
 */
export function extractSelfReportedConditionCodes(formData: Record<string, unknown>): string[] {
  const codes: string[] = [];

  const q58 = formData[Q58_QUESTION_CODE];
  const q58Answers = Array.isArray(q58) ? q58 : typeof q58 === 'string' ? [q58] : [];
  for (const answer of q58Answers) {
    if (typeof answer !== 'string') continue;
    const mapped = DIAGNOSED_CONDITION_CODE_TO_RISK_CONDITION_CODE[answer];
    if (mapped) codes.push(mapped);
  }

  const q60 = formData[Q60_QUESTION_CODE];
  if (typeof q60 === 'string') {
    const mapped = SICKLE_CELL_STATUS_CODE_TO_RISK_CONDITION_CODE[q60];
    if (mapped) codes.push(mapped);
  }

  return [...new Set(codes)];
}

/**
 * Pushes a MOTHER_REGISTRATION submission's self-reported diagnosed
 * conditions and sickle cell status to beneficiary-service as
 * BeneficiaryRiskConditionSummary rows, resolving each conditionCode to its
 * riskConditionId via risk-referral-service first (this service owns neither
 * table — no cross-service joins per the forklift rule).
 *
 * Best-effort by design, matching syncSocioDemographics's stance: the
 * submission itself is already durably saved by the time this runs, and
 * form_submissions.form_data_json keeps every answer verbatim regardless. A
 * failure here is logged and swallowed rather than failing the Sakhi's
 * submission.
 */
export async function syncHealthHistory(
  beneficiaryId: string,
  formData: Record<string, unknown>,
  authorizationHeader: string,
): Promise<void> {
  const conditionCodes = extractSelfReportedConditionCodes(formData);
  if (conditionCodes.length === 0) return;

  let resolved: { conditionCode: string; riskConditionId: string }[];
  try {
    const res = await fetch(
      `${API_GATEWAY_BASE_URL}/api/v1/risk-conditions?conditionCode=${conditionCodes.join(',')}`,
      { headers: { Authorization: authorizationHeader } },
    );
    if (!res.ok) {
      console.warn(
        `Failed to resolve self-reported condition codes for beneficiary ${beneficiaryId} ` +
          `(risk-referral-service returned ${res.status}); the submission itself was still saved.`,
      );
      return;
    }
    const body = (await res.json()) as {
      data: { conditionCode: string; riskConditionId: string }[];
    };
    resolved = body.data;
  } catch (err) {
    console.warn(
      `Unable to reach risk-referral-service to resolve self-reported condition codes for ` +
        `beneficiary ${beneficiaryId}; the submission itself was still saved. ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return;
  }

  const assessedAt = new Date().toISOString();
  for (const { riskConditionId } of resolved) {
    try {
      const res = await fetch(
        `${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}/risk-condition-summary`,
        {
          method: 'PATCH',
          headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            riskConditionId,
            phase: 'REGISTRATION',
            assessedAt,
            isReferralTrigger: false,
            isHrVisitTrigger: false,
          }),
        },
      );
      if (!res.ok) {
        console.warn(
          `Failed to sync health history for beneficiary ${beneficiaryId}, condition ` +
            `${riskConditionId} (beneficiary-service returned ${res.status}); the submission ` +
            'itself was still saved.',
        );
      }
    } catch (err) {
      console.warn(
        `Unable to reach beneficiary-service to sync health history for beneficiary ` +
          `${beneficiaryId}, condition ${riskConditionId}; the submission itself was still ` +
          `saved. ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
