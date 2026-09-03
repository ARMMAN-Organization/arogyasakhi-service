/**
 * Per-form-code allowlist of fieldCodes a Sakhi may PATCH via
 * `PATCH /form-submissions/:id/answers` without Supervisor approval — the
 * source of truth is SRS Appendix J.4, "Post-Submission Editable Fields —
 * Developer Reference" (docs/Arogya_Sakhi_SRS_v3.0.md:1849-1858). Every
 * fieldCode below is cross-referenced against the actual `question_code`
 * values in that form's seed JSON
 * (apps/visit-form-service/prisma/seed-data/*.json) — never guessed from the
 * SRS's plain-English labels.
 *
 * A form code with no row in the SRS table (ANC_VISIT, REFERRAL_VISIT, and
 * any other referral-linked form) gets an empty array here — always
 * rejected by FormService.updateSubmissionAnswers, matching J.4's own "None
 * / N/A" entries for those forms.
 *
 * Two SRS ambiguities were escalated during this task and decided by the
 * product owner directly (see this task's brief) — both are called out
 * inline below where they apply:
 * 1. Infant Registration's "Current length/weight at registration" alias to
 *    the same birth-measurement fieldCodes as "Birth length/weight" — no
 *    such "current measurement at registration" field exists in
 *    child-registration.json; only child_length_at_birth_in_cm/
 *    child_weight_at_birth_in_kg do, which the same SRS row also lists
 *    separately as "Birth length/weight".
 * 2. PW Registration's `edd` is deliberately EXCLUDED even though SRS J.4
 *    lists "EDD (auto-recalcs)" as editable — EDD only ever changes as a
 *    computed side effect of an approved LMP_CHANGE request (Tasks 1/4's
 *    approval-gated flow), never as a direct edit. `lmp_date` is likewise
 *    excluded — LMP correction has its own dedicated approval-gated
 *    endpoint, not this direct-edit one.
 */
// Infant Visits' vaccination-field allowlist — shared verbatim by
// INFANT_VISIT/INC_VISIT/CCV_VISIT (see the doc comment on that row below),
// declared once so the three form codes can never drift apart.
const INFANT_VISIT_VACCINATION_FIELDS: readonly string[] = [
  'bcg',
  'bcg_date',
  'opv_0',
  'opv_0_date',
  'hepatitis_b_birth_dose',
  'hepatitis_b_date_birth_dose',
  'vitamin_k',
  'vitamin_k_date',
  'opv_1',
  'opv_1_date',
  'pentavalent_1_dpt1',
  'pentavalent_1_dpt1_date',
  'ipv_1',
  'ipv_1_date',
  'rotavirus1',
  'rotavirus1_date',
  'pcv1',
  'pcv1_date',
  'opv_2',
  'opv_2_date',
  'pentavalent_2_dpt2',
  'pentavalent_2_dpt2_date',
  'rotavirus2',
  'rotavirus2_date',
  'opv_3',
  'opv_3_date',
  'pentavalent_3_dpt3',
  'pentavalent_3_dpt3_date',
  'ipv2',
  'ipv2_date',
  'rotavirus3',
  'rotavirus3_date',
  'pcv2',
  'pcv2_date',
  'mmr_1_mr1',
  'mmr_1_mr1_date',
  'pcv_booster',
  'pcv_booster_date',
  'vitamin_a',
  'vitamin_a_date',
  'opv_booster',
  'opv_booster_date',
  'mmr2_mr2',
  'mmr2_mr2_date',
  'dpt_booster1',
  'dpt_booster1_date',
  'source_of_immunization_data_collected',
];

export const FORM_ANSWER_EDIT_ALLOWLIST: Readonly<Record<string, readonly string[]>> = {
  // SRS J.4 row "PW Registration": "LMP date, EDD (auto-recalcs), Address,
  // Mobile, Phone owner, Gravida, Para, Living children, Abortions,
  // Stillbirths, Dead children, Sickle Cell." LMP date and EDD are
  // deliberately omitted — see decision 2 above. Field codes verified
  // against mother-registration.json.
  MOTHER_REGISTRATION: [
    'enter_the_beneficiary_address', // Address
    'mobile_number', // Mobile
    'who_owns_the_phone', // Phone owner
    'gravida_total_number_of_pregnancies', // Gravida
    'para_number_of_births_after_24_weeks', // Para
    'living_children', // Living children
    'abortions_pregnancy_losses_before_24_weeks', // Abortions
    'still_births', // Stillbirths
    'dead_children', // Dead children
    'have_you_been_detected_with_sickle_cell_disease_or_sickle_cell_trait_sct', // Sickle Cell
  ],

  // SRS J.4 row "Infant Registration": "Caregiver name, Mother DOB, Address,
  // Mobile, Phone owner, Birth length, Birth weight, Current length at
  // registration, Current weight at registration." Field codes verified
  // against child-registration.json. "Current length/weight at
  // registration" has no dedicated fieldCode in the schema — decision 1
  // above aliases both SRS-named concepts onto the same birth-measurement
  // fieldCodes rather than inventing a second, non-existent field or
  // duplicating the entry.
  CHILD_REGISTRATION: [
    'caregiver_name_first_name_middle_name_last_name', // Caregiver name
    'mother_date_of_birth', // Mother DOB
    'enter_the_beneficiary_address', // Address
    'mobile_number', // Mobile
    'who_owns_the_phone', // Phone owner
    // Birth length AND "Current length at registration" (decision 1 alias)
    'child_length_at_birth_in_cm',
    // Birth weight AND "Current weight at registration" (decision 1 alias)
    'child_weight_at_birth_in_kg',
  ],

  // SRS J.4 row "Delivery / PP / Neonatal": "Birth length and weight (all
  // children), Cause/place/date of neonatal death (all children and
  // neonatal)." DELIVERY_VISIT carries both the per-child birth
  // measurements and per-child death fields (child1/2/3_*, verified against
  // delivery-visit.json); POSTPARTUM_VISIT has no matching fields in its
  // own schema (postpartum-visit.json has no birth-measurement or death
  // fields), so it is intentionally absent from this map (falls through to
  // an empty allowlist).
  DELIVERY_VISIT: [
    'child1_birth_length_cm',
    'child1_birth_weight_kg',
    'child1_cause_of_death',
    'child1_place_of_death',
    'child1_date_of_death',
    'child2_birth_length_cm',
    'child2_birth_weight_kg',
    'child2_cause_of_death',
    'child2_place_of_death',
    'child2_date_of_death',
    'child3_birth_length_cm',
    'child3_birth_weight_kg',
    'child3_cause_of_death',
    'child3_place_of_death',
    'child3_date_of_death',
  ],

  // Neonatal's own death fields, verified against neonatal-visit.json —
  // same SRS row as DELIVERY_VISIT above ("...and neonatal)").
  NEONATAL_VISIT: ['cause_of_death', 'place_of_death', 'date_of_death'],

  // SRS J.4 row "ANC Closure": "Closure reason, Date of event, Time/cause/
  // place of maternal death, Other specify." Field codes verified against
  // anc-closure-visit.json — "Time/cause/place of maternal death" spans
  // three distinct fieldCodes (maternal_death_time/_cause/_place), and
  // "Other specify" is maternal_death_cause_other_specify.
  ANC_CLOSURE_VISIT: [
    'closure_reason',
    'date_of_event',
    'maternal_death_time',
    'maternal_death_cause',
    'maternal_death_place',
    'maternal_death_cause_other_specify',
  ],

  // SRS J.4 row "Child Closure": "Closure reason, Date of event, Time/
  // cause/place of infant death, Other specify." Field codes verified
  // against child-closure-visit.json.
  CHILD_CLOSURE_VISIT: [
    'closure_reason',
    'date_of_event',
    'infant_death_time',
    'infant_death_cause',
    'infant_death_place',
    'infant_death_cause_other_specify',
  ],

  // SRS J.4 row "Infant Visits": "All vaccination fields and dates, Source
  // of immunisation data." INFANT_VISIT/INC_VISIT/CCV_VISIT all share the
  // same schema content (infant-visit.json — see prisma/seed.ts's own doc
  // comment on this aliasing), so the same allowlist applies to all three
  // form codes — declared once as INFANT_VISIT_VACCINATION_FIELDS above and
  // reused verbatim below so the three form codes can never drift apart.
  INFANT_VISIT: INFANT_VISIT_VACCINATION_FIELDS,
  INC_VISIT: INFANT_VISIT_VACCINATION_FIELDS,
  CCV_VISIT: INFANT_VISIT_VACCINATION_FIELDS,
};

/**
 * The editable fieldCodes for `formCode`, or an empty array for any form
 * code not listed in SRS Appendix J.4 (ANC_VISIT, REFERRAL_VISIT,
 * REFERRAL_FOLLOWUP_VISIT, POSTPARTUM_VISIT, BENEFICIARY_REOPEN_VISIT,
 * etc.) — always rejected by FormService.updateSubmissionAnswers.
 */
export function getEditableFieldCodes(formCode: string): readonly string[] {
  return FORM_ANSWER_EDIT_ALLOWLIST[formCode] ?? [];
}
