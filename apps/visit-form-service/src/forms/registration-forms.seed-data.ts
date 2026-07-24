/**
 * One entry in form_versions.schema_json — mirrors formFieldSchema in
 * src/forms/dto/form-field.dto.ts. Only the keys that schema actually
 * validates are used here.
 */
export interface SeedField {
  question_code: string;
  label: string;
  input_type: string;
  required: boolean;
  lookup_category_code?: string;
  computedFrom?: string;
  /** Client-side tab grouping (e.g. "Consent", "Personal Info", "Health
   * History") restoring the old static enrollment stepper's UX for the
   * dynamic form. Tab order on the client is first-seen order in this array.
   * Mapping per mother-registration-static-fields-by-tab.md (the old
   * EnrollmentViewModel/step composables) — LMP/EDD sit at the end of
   * Personal Info in that flow, not in Health History. */
  section?: string;
}

/**
 * Form master data — the registration forms defined by the ERD's
 * form_definitions master list (form_code MOTHER_REGISTRATION /
 * CHILD_REGISTRATION). Field lists come from SRS §7.x "PW Registration
 * Form" / "Infant Registration Form" (line 425-427). Computed fields
 * (EDD) carry `computedFrom` so they are not manually entered. Dropdown
 * fields carry `lookup_category_code` pointing at auth-service's lookup
 * categories (SEX, PHONE_OWNER seeded there).
 *
 * This is real master data required in every environment for the dynamic
 * enrollment form to render — not test data. Seeded (by prisma/seed.ts) as a
 * single PUBLISHED v1 so `GET /forms/:formCode/active-version` returns
 * immediately.
 *
 * Kept in its own side-effect-free module (no Prisma import) so
 * beneficiary-duplicated-fields.spec.ts can import the real question_codes
 * without triggering prisma/seed.ts's top-level `main()` run.
 */
export const REGISTRATION_FORMS: {
  formCode: string;
  formName: string;
  entityType: 'MOTHER' | 'CHILD';
  fields: SeedField[];
}[] = [
  {
    formCode: 'MOTHER_REGISTRATION',
    formName: 'Pregnant Woman Registration',
    entityType: 'MOTHER',
    fields: [
      {
        question_code: 'beneficiary_address',
        label: 'Beneficiary address',
        input_type: 'text',
        required: false,
        section: 'Personal Info',
      },
      {
        question_code: 'mobile_number',
        label: 'Mobile number',
        input_type: 'text',
        required: false,
        section: 'Personal Info',
      },
      {
        question_code: 'phone_owner',
        label: 'Phone owner',
        input_type: 'select',
        required: false,
        lookup_category_code: 'PHONE_OWNER',
        section: 'Personal Info',
      },
      {
        question_code: 'lmp_date',
        label: 'LMP date',
        input_type: 'date',
        required: true,
        section: 'Personal Info',
      },
      {
        question_code: 'edd_date',
        label: 'EDD',
        input_type: 'date',
        required: false,
        computedFrom: 'EDD_FROM_LMP',
        section: 'Personal Info',
      },
      {
        question_code: 'gravida',
        label: 'Gravida',
        input_type: 'number',
        required: false,
        section: 'Health History',
      },
      {
        question_code: 'para',
        label: 'Para',
        input_type: 'number',
        required: false,
        section: 'Health History',
      },
      {
        question_code: 'living_children',
        label: 'Living children',
        input_type: 'number',
        required: false,
        section: 'Health History',
      },
      {
        question_code: 'abortions',
        label: 'Abortions',
        input_type: 'number',
        required: false,
        section: 'Health History',
      },
      {
        question_code: 'stillbirths',
        label: 'Stillbirths',
        input_type: 'number',
        required: false,
        section: 'Health History',
      },
      {
        question_code: 'dead_children',
        label: 'Dead children',
        input_type: 'number',
        required: false,
        section: 'Health History',
      },
      {
        question_code: 'sickle_cell_status',
        label: 'Sickle Cell status',
        input_type: 'text',
        required: false,
        section: 'Health History',
      },
    ],
  },
  {
    formCode: 'CHILD_REGISTRATION',
    formName: 'Infant Registration',
    entityType: 'CHILD',
    fields: [
      {
        question_code: 'caregiver_name',
        label: 'Caregiver name',
        input_type: 'text',
        required: true,
        section: 'Personal Info',
      },
      {
        question_code: 'mother_date_of_birth',
        label: 'Mother date of birth',
        input_type: 'date',
        required: false,
        section: 'Personal Info',
      },
      {
        question_code: 'beneficiary_address',
        label: 'Beneficiary address',
        input_type: 'text',
        required: false,
        section: 'Personal Info',
      },
      {
        question_code: 'mobile_number',
        label: 'Mobile number',
        input_type: 'text',
        required: false,
        section: 'Personal Info',
      },
      {
        question_code: 'phone_owner',
        label: 'Phone owner',
        input_type: 'select',
        required: false,
        lookup_category_code: 'PHONE_OWNER',
        section: 'Personal Info',
      },
      {
        question_code: 'child_birth_length',
        label: 'Child birth length',
        input_type: 'number',
        required: false,
        section: 'Health History',
      },
      {
        question_code: 'child_birth_weight',
        label: 'Child birth weight',
        input_type: 'number',
        required: false,
        section: 'Health History',
      },
      {
        question_code: 'current_length_at_registration',
        label: 'Current length at registration',
        input_type: 'number',
        required: false,
        section: 'Health History',
      },
      {
        question_code: 'current_weight_at_registration',
        label: 'Current weight at registration',
        input_type: 'number',
        required: false,
        section: 'Health History',
      },
    ],
  },
];
