/** Result of one seed step, reported in the summary printed by `main()`. */
export interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

/**
 * Role master data — the 4 user classes defined in
 * docs/Arogya_Sakhi_SRS_v3.0.md §2.2 "User Classes and Characteristics"
 * (Arogya Sakhi, Supervisor, Program Manager, System Administrator). The SRS
 * is authoritative over the ERD for this project; the ERD's roles.role_code
 * enum lists three additional codes (CONTENT_MANAGER, ANALYST, M_AND_E) that
 * are not SRS user classes and are intentionally excluded here. This is real
 * reference data required in every environment, including production — not
 * test data.
 */
export const ROLES: { roleCode: string; roleName: string; description: string }[] = [
  {
    roleCode: 'SAKHI',
    roleName: 'Arogya Sakhi',
    description: 'Community health worker — field enrolment and visits.',
  },
  {
    roleCode: 'SUPERVISOR',
    roleName: 'Supervisor',
    description: 'Supervises a set of Arogya Sakhis.',
  },
  {
    roleCode: 'MANAGER',
    roleName: 'Program Manager',
    description: 'Program-level monitoring and reporting.',
  },
  { roleCode: 'ADMIN', roleName: 'Administrator', description: 'Platform administration.' },
];

/**
 * Lookup category/value master data — dropdown options used across forms
 * per the ERD's lookup_categories/lookup_values design (docs/
 * Arogya_Sakhi_Database_Design_ERD_Table_Definitions.docx.md, line 794 lists
 * SEX/PHONE_OWNER/EDUCATION_LEVEL/VISIT_STATUS/REFERRAL_TYPE/RISK_GRADE/
 * CLOSURE_REASON as the example categories).
 *
 * value_code for VISIT_STATUS/REFERRAL_TYPE/CLOSURE_REASON matches the
 * member names of the Postgres enums they replace 1:1 (VisitInstanceStatus,
 * ReferralType, ClosureReason), so each service's migration can backfill its
 * new lookup-value-id column by looking up the row with a matching code.
 *
 * PHONE_OWNER and EDUCATION_LEVEL have no confirmed source yet — the SRS
 * cites an external "Revised App Form Final (20 March 2026)" Excel document
 * as the authoritative source for these two categories' values, and that
 * document is not available in this repo. The values below are provisional
 * placeholders (common options in Indian maternal-health programs) and MUST
 * be reviewed/replaced once the real source document is available.
 */
export const LOOKUP_CATEGORIES: {
  categoryCode: string;
  categoryName: string;
  description: string;
  values: { valueCode: string; valueLabel: string; sortOrder: number }[];
}[] = [
  {
    categoryCode: 'SEX',
    categoryName: 'Sex',
    description: 'Shared sex value set for both adult (mother/caregiver) and child records.',
    values: [
      { valueCode: 'FEMALE', valueLabel: 'Female', sortOrder: 0 },
      { valueCode: 'MALE', valueLabel: 'Male', sortOrder: 1 },
      { valueCode: 'OTHER', valueLabel: 'Other', sortOrder: 2 },
      { valueCode: 'INTERSEX', valueLabel: 'Intersex', sortOrder: 3 },
    ],
  },
  {
    categoryCode: 'PHONE_OWNER',
    categoryName: 'Phone Owner',
    description:
      'PROVISIONAL — placeholder values pending the "Revised App Form Final (20 March 2026)" source document.',
    values: [
      { valueCode: 'SELF', valueLabel: 'Self', sortOrder: 0 },
      { valueCode: 'HUSBAND', valueLabel: 'Husband', sortOrder: 1 },
      { valueCode: 'FATHER_IN_LAW', valueLabel: 'Father-in-law', sortOrder: 2 },
      { valueCode: 'OTHER_FAMILY_MEMBER', valueLabel: 'Other family member', sortOrder: 3 },
    ],
  },
  {
    categoryCode: 'EDUCATION_LEVEL',
    categoryName: 'Education Level',
    description:
      'PROVISIONAL — placeholder values pending the "Revised App Form Final (20 March 2026)" source document.',
    values: [
      { valueCode: 'ILLITERATE', valueLabel: 'Illiterate', sortOrder: 0 },
      { valueCode: 'PRIMARY', valueLabel: 'Primary', sortOrder: 1 },
      { valueCode: 'SECONDARY', valueLabel: 'Secondary', sortOrder: 2 },
      { valueCode: 'HIGHER_SECONDARY', valueLabel: 'Higher secondary', sortOrder: 3 },
      { valueCode: 'GRADUATE', valueLabel: 'Graduate', sortOrder: 4 },
      { valueCode: 'POST_GRADUATE', valueLabel: 'Post-graduate', sortOrder: 5 },
    ],
  },
  {
    categoryCode: 'RISK_GRADE',
    categoryName: 'Risk Grade',
    description:
      'Evaluated risk grade for a condition at a visit (risk-referral-service risk_flags).',
    values: [
      { valueCode: 'NORMAL', valueLabel: 'Normal', sortOrder: 0 },
      { valueCode: 'MILD', valueLabel: 'Mild', sortOrder: 1 },
      { valueCode: 'MODERATE', valueLabel: 'Moderate', sortOrder: 2 },
      { valueCode: 'SEVERE', valueLabel: 'Severe', sortOrder: 3 },
      { valueCode: 'HIGH', valueLabel: 'High', sortOrder: 4 },
      { valueCode: 'CRITICAL', valueLabel: 'Critical', sortOrder: 5 },
    ],
  },
  {
    categoryCode: 'VISIT_STATUS',
    categoryName: 'Visit Status',
    description: "Replaces visit-form-service's VisitInstanceStatus Postgres enum.",
    values: [
      { valueCode: 'STARTED', valueLabel: 'Started', sortOrder: 0 },
      { valueCode: 'PENDING', valueLabel: 'Pending', sortOrder: 1 },
      { valueCode: 'MISSED', valueLabel: 'Missed', sortOrder: 2 },
      { valueCode: 'COMPLETED', valueLabel: 'Completed', sortOrder: 3 },
      { valueCode: 'DISCARDED', valueLabel: 'Discarded', sortOrder: 4 },
    ],
  },
  {
    categoryCode: 'REFERRAL_TYPE',
    categoryName: 'Referral Type',
    description: "Replaces risk-referral-service's ReferralType Postgres enum.",
    values: [
      { valueCode: 'STANDARD', valueLabel: 'Standard', sortOrder: 0 },
      { valueCode: 'ACCOMPANIED', valueLabel: 'Accompanied', sortOrder: 1 },
    ],
  },
  {
    categoryCode: 'CLOSURE_REASON',
    categoryName: 'Closure Reason',
    description: "Replaces closure-reopen-service's ClosureReason Postgres enum.",
    values: [
      { valueCode: 'MISCARRIAGE', valueLabel: 'Miscarriage', sortOrder: 0 },
      { valueCode: 'ABORTION', valueLabel: 'Abortion', sortOrder: 1 },
      { valueCode: 'MATERNAL_DEATH', valueLabel: 'Maternal death', sortOrder: 2 },
      { valueCode: 'INFANT_OR_CHILD_DEATH', valueLabel: 'Infant or child death', sortOrder: 3 },
      { valueCode: 'MIGRATION', valueLabel: 'Migration', sortOrder: 4 },
      { valueCode: 'WITHDRAWAL', valueLabel: 'Withdrawal', sortOrder: 5 },
      { valueCode: 'PROGRAM_CYCLE_COMPLETED', valueLabel: 'Program cycle completed', sortOrder: 6 },
      { valueCode: 'OTHER', valueLabel: 'Other', sortOrder: 7 },
    ],
  },
  {
    categoryCode: 'CASE_TYPE',
    categoryName: 'Case Type',
    description:
      "Mirrors beneficiary-service's CaseType Postgres enum (MOTHER/CHILD) as a lookup-value row, for beneficiary_cases.case_type_lookup_id — a cross-service scalar FK per the forklift rule.",
    values: [
      { valueCode: 'MOTHER', valueLabel: 'Mother', sortOrder: 0 },
      { valueCode: 'CHILD', valueLabel: 'Child', sortOrder: 1 },
    ],
  },
  {
    categoryCode: 'BENEFICIARY_TYPE',
    categoryName: 'Beneficiary Type',
    description:
      'Beneficiary type at enrolment, for beneficiary_cases.beneficiary_type_lookup_id per the ERD. PROVISIONAL — placeholder pending the "Revised App Form Final (20 March 2026)" source document.',
    values: [
      { valueCode: 'PREGNANT_WOMAN', valueLabel: 'Pregnant Woman', sortOrder: 0 },
      { valueCode: 'CHILD', valueLabel: 'Child', sortOrder: 1 },
    ],
  },
];

/**
 * Minimal geography_units seed — one row per level of the SRS's 7-level
 * hierarchy (State > District > Block > PHC > Sub-centre > Village > Pada),
 * linked by parentCode. Test/dev data only: real state/district/etc. names
 * are not specified in the SRS/HLD/ERD, so these are placeholder identifiers
 * sufficient to exercise POST /beneficiaries end-to-end, not real ARMMAN
 * program geography.
 */
export const GEOGRAPHY_UNITS: {
  geoCode: string;
  name: string;
  geoType: 'STATE' | 'DISTRICT' | 'BLOCK' | 'PHC' | 'SUBCENTRE' | 'VILLAGE' | 'PADA';
  parentCode: string | null;
}[] = [
  { geoCode: 'MH', name: 'Maharashtra', geoType: 'STATE', parentCode: null },
  { geoCode: 'NANDURBAR', name: 'Nandurbar', geoType: 'DISTRICT', parentCode: 'MH' },
  { geoCode: 'DHADGAON', name: 'Dhadgaon', geoType: 'BLOCK', parentCode: 'NANDURBAR' },
  { geoCode: 'PHC-TEST-01', name: 'Test PHC', geoType: 'PHC', parentCode: 'DHADGAON' },
  {
    geoCode: 'SC-TEST-01',
    name: 'Test Sub-centre',
    geoType: 'SUBCENTRE',
    parentCode: 'PHC-TEST-01',
  },
  { geoCode: 'VLG-TEST-01', name: 'Test Village', geoType: 'VILLAGE', parentCode: 'SC-TEST-01' },
  { geoCode: 'PADA-TEST-01', name: 'Test Pada', geoType: 'PADA', parentCode: 'VLG-TEST-01' },
];
