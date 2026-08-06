/**
 * question_codes on the MOTHER_REGISTRATION form whose values are already
 * persisted as structured columns in beneficiary-service (via
 * POST /beneficiaries) at the time the Sakhi submits this form — the
 * registration form re-asks them so the on-device flow can show a single
 * continuous questionnaire, but the answers are redundant with what
 * beneficiary-service already stored.
 *
 * Excluded ONLY from form_answers (the normalized, per-question projection)
 * to avoid persisting a second, independently-editable copy of data that
 * beneficiary-service already owns. form_submissions.form_data_json still
 * stores every field verbatim — this list does not affect validation, the
 * app's request payload, or the raw submission record (ERD line 19: the
 * complete submitted payload must be kept, even for fields also promoted
 * elsewhere).
 *
 * Source of the mapping: see the beneficiary-service create-beneficiary DTO
 * (piiSchema / motherDetailsSchema) — each code below corresponds 1:1 to a
 * field accepted there. Keep the two lists in sync if either form changes.
 */
export const BENEFICIARY_DUPLICATED_FIELD_CODES: ReadonlySet<string> = new Set([
  // pii.fullName
  'beneficiary_name',
  // pii.dateOfBirth
  'date_of_birth',
  // pii.phone
  'mobile_number',
  // pii.addressLine
  'enter_the_beneficiary_address',
  // pii.stateId / districtId / talukaId / villageId / padaId / phcId / healthSubCentreId
  'name_of_the_state',
  'name_of_district',
  'name_of_block_taluka',
  'name_of_the_revenue_village_grampanchayat',
  'beneficary_pada_name',
  'beneficary_phc_name',
  'name_of_sub_center',
  // motherDetails.lmpDate / computed EDD
  'lmp_date',
  'edd',
  // motherDetails.gravida / parity / liveBirths / abortions / stillbirths / deadChildren
  'gravida_total_number_of_pregnancies',
  'para_number_of_births_after_24_weeks',
  'living_children',
  'abortions_pregnancy_losses_before_24_weeks',
  'still_births',
  'dead_children',
  // motherDetails.heightCm / weightKg
  'height_cm',
  'weight_kg',
]);
