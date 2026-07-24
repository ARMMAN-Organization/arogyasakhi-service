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
 * (piiSchema / motherDetailsSchema) and this service's seeded
 * MOTHER_REGISTRATION form (prisma/seed.ts) — each code below matches a
 * question_code actually seeded there. There is no compile-time link across
 * the two services (they're independently deployable), so
 * form.mapper.spec.ts's "beneficiary-duplicated fields" suite asserts every
 * code here matches a real seeded question_code, catching drift if either
 * side renames a field.
 */
export const BENEFICIARY_DUPLICATED_FIELD_CODES: ReadonlySet<string> = new Set([
  // pii.addressLine
  'beneficiary_address',
  // pii.phone
  'mobile_number',
  // motherDetails.lmpDate / computed EDD
  'lmp_date',
  'edd_date',
  // motherDetails.gravida / parity / liveBirths / abortions / stillbirths / deadChildren
  'gravida',
  'para',
  'living_children',
  'abortions',
  'stillbirths',
  'dead_children',
]);
