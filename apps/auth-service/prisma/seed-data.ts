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
 * PHONE_OWNER, EDUCATION_LEVEL, MOBILE_NETWORK_AVAILABILITY,
 * PARTNER_OCCUPATION, MIGRATION_PATTERN, MONTHLY_INCOME_BRACKET, RELIGION,
 * and SOCIAL_CATEGORY value sets are sourced from the "Revised App Form
 * Final (20 March 2026)" Excel document (transcribed at
 * docs/Revised_App_Form_Final_20.3.26.xlsx.md in beneficiary-service,
 * Registration_PW_D sheet rows 23-32) — the SRS's authoritative source for
 * these categories, now available in-repo.
 *
 * RISK_CATEGORY, RISK_TYPE, VISIT_CATEGORY, ITEM_CATEGORY, TRANSACTION_TYPE,
 * GATHERING_TYPE, and GATHERING_STATUS value_codes each match 1:1 the member
 * names of the Postgres enum they expose as a downloadable master list for
 * the Supervisor app (OverallRiskCategory, RiskPhase, VisitCodeType,
 * InventoryItemCategory, InventoryTransactionType, SupervisorEventType,
 * SupervisorEventStatus respectively) — same backfill rationale as
 * VISIT_STATUS/REFERRAL_TYPE/CLOSURE_REASON above, and same drift risk: if
 * the source enum ever gains/loses a member, this list needs a matching edit.
 *
 * LANGUAGE is sourced from docs/Arogya_Sakhi_SRS_v3.0.md Appendix I ("Language
 * Support") — English and Marathi only, Hindi explicitly removed from scope.
 *
 * UOM is PROVISIONAL, same placeholder stance as BENEFICIARY_TYPE above — no
 * source document defines a unit-of-measure master list, and
 * inventory_items.unit is deliberately free text per the ERD, so these
 * values are advisory only (a Supervisor-app picker), not a constraint.
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
      'Registration form "Who owns the phone?" (Revised App Form Final, Registration_PW_D row 23).',
    values: [
      { valueCode: 'SELF', valueLabel: 'Self', sortOrder: 0 },
      { valueCode: 'HUSBAND', valueLabel: 'Husband', sortOrder: 1 },
      { valueCode: 'FAMILY_MEMBER', valueLabel: 'Family member', sortOrder: 2 },
      { valueCode: 'ASHA', valueLabel: 'ASHA', sortOrder: 3 },
      { valueCode: 'NEIGHBOUR', valueLabel: 'Neighbour', sortOrder: 4 },
    ],
  },
  {
    categoryCode: 'EDUCATION_LEVEL',
    categoryName: 'Education Level',
    description:
      'Registration form "Highest level of education completed" — shared by beneficiary and partner education questions (Revised App Form Final, Registration_PW_D rows 25-26).',
    values: [
      { valueCode: 'NO_FORMAL_EDUCATION', valueLabel: 'No formal education', sortOrder: 0 },
      { valueCode: 'PRIMARY', valueLabel: 'Primary education (Class 1-5)', sortOrder: 1 },
      {
        valueCode: 'UPPER_PRIMARY_MIDDLE',
        valueLabel: 'Upper primary / Middle school (Class 6-9)',
        sortOrder: 2,
      },
      { valueCode: 'TENTH_PASS', valueLabel: '10th Pass', sortOrder: 3 },
      { valueCode: 'TWELFTH_PASS', valueLabel: '12th Pass', sortOrder: 4 },
      { valueCode: 'DIPLOMA', valueLabel: 'Diploma', sortOrder: 5 },
      { valueCode: 'GRADUATE', valueLabel: 'Graduate (College degree)', sortOrder: 6 },
      { valueCode: 'POST_GRADUATE', valueLabel: 'Post Graduate and above', sortOrder: 7 },
    ],
  },
  {
    categoryCode: 'MOBILE_NETWORK_AVAILABILITY',
    categoryName: 'Mobile Network Availability',
    description:
      'Registration form "Availability of Mobile Network" (Revised App Form Final, Registration_PW_D row 24).',
    values: [
      { valueCode: 'NO_NETWORK', valueLabel: 'No Network', sortOrder: 0 },
      {
        valueCode: 'VERY_POOR_NETWORK',
        valueLabel: 'Very Poor Network (Have to go height which is 10 minutes walk away)',
        sortOrder: 1,
      },
      {
        valueCode: 'AVAILABLE_OUTSIDE_HOME_SPECIFIC_TIME',
        valueLabel: 'Network Available outside the home at some specific time',
        sortOrder: 2,
      },
      {
        valueCode: 'AVAILABLE_OUTSIDE_HOME_ALL_TIME',
        valueLabel: 'Network available only outside home all time',
        sortOrder: 3,
      },
      { valueCode: 'FULL_NETWORK_AVAILABLE', valueLabel: 'Full Network Available', sortOrder: 4 },
    ],
  },
  {
    categoryCode: 'PARTNER_OCCUPATION',
    categoryName: 'Partner Occupation',
    description:
      'Registration form "Occupation of your partner" (Revised App Form Final, Registration_PW_D row 27).',
    values: [
      { valueCode: 'LABOUR', valueLabel: 'Labour', sortOrder: 0 },
      { valueCode: 'PRIVATE_JOB', valueLabel: 'Private Job', sortOrder: 1 },
      { valueCode: 'GOVERNMENT_JOB', valueLabel: 'Government Job', sortOrder: 2 },
      { valueCode: 'BUSINESS', valueLabel: 'Business', sortOrder: 3 },
      { valueCode: 'FARMER', valueLabel: 'Farmer', sortOrder: 4 },
      { valueCode: 'OTHER', valueLabel: 'Other', sortOrder: 5 },
    ],
  },
  {
    categoryCode: 'MIGRATION_PATTERN',
    categoryName: 'Migration Pattern',
    description:
      'Registration form "Household\'s migration pattern" (Revised App Form Final, Registration_PW_D row 29).',
    values: [
      { valueCode: 'PERMANENT_MIGRATION', valueLabel: 'Permanent migration', sortOrder: 0 },
      {
        valueCode: 'SEASONAL_MIGRATION',
        valueLabel: 'Seasonal migration (leave for work during specific months)',
        sortOrder: 1,
      },
      {
        valueCode: 'CIRCULAR_MIGRATION',
        valueLabel: 'Circular migration (move between two places repeatedly)',
        sortOrder: 2,
      },
      {
        valueCode: 'TEMPORARY_MIGRATION_FOR_EMPLOYMENT',
        valueLabel: 'Temporary migration for employment',
        sortOrder: 3,
      },
      {
        valueCode: 'DISPLACEMENT_DUE_TO_CRISIS',
        valueLabel: 'Displacement due to crisis (disaster, conflict, eviction)',
        sortOrder: 4,
      },
    ],
  },
  {
    categoryCode: 'MONTHLY_INCOME_BRACKET',
    categoryName: 'Monthly Income Bracket',
    description:
      'Registration form "Income of the family per month" (Revised App Form Final, Registration_PW_D row 30).',
    values: [
      { valueCode: 'UPTO_10000', valueLabel: '<=10000', sortOrder: 0 },
      { valueCode: 'FROM_10001_TO_15000', valueLabel: '10001-15000', sortOrder: 1 },
      { valueCode: 'FROM_15001_TO_20000', valueLabel: '15001-20000', sortOrder: 2 },
      { valueCode: 'FROM_20001_TO_25000', valueLabel: '20001-25000', sortOrder: 3 },
      { valueCode: 'ABOVE_25000', valueLabel: '>25000', sortOrder: 4 },
    ],
  },
  {
    categoryCode: 'RELIGION',
    categoryName: 'Religion',
    description: 'Registration form "Religion" (Revised App Form Final, Registration_PW_D row 31).',
    values: [
      { valueCode: 'BUDDHIST', valueLabel: 'Buddhist', sortOrder: 0 },
      { valueCode: 'CHRISTIAN', valueLabel: 'Christian', sortOrder: 1 },
      { valueCode: 'HINDU', valueLabel: 'Hindu', sortOrder: 2 },
      { valueCode: 'JAIN', valueLabel: 'Jain', sortOrder: 3 },
      { valueCode: 'MUSLIM', valueLabel: 'Muslim', sortOrder: 4 },
      { valueCode: 'SIKH', valueLabel: 'Sikh', sortOrder: 5 },
      { valueCode: 'OTHER', valueLabel: 'Other', sortOrder: 6 },
    ],
  },
  {
    categoryCode: 'SOCIAL_CATEGORY',
    categoryName: 'Social Category',
    description: 'Registration form "Category" (Revised App Form Final, Registration_PW_D row 32).',
    values: [
      { valueCode: 'GENERAL', valueLabel: 'General', sortOrder: 0 },
      { valueCode: 'OBC', valueLabel: 'OBC', sortOrder: 1 },
      { valueCode: 'OTHER', valueLabel: 'Other', sortOrder: 2 },
      { valueCode: 'SC', valueLabel: 'SC', sortOrder: 3 },
      { valueCode: 'ST', valueLabel: 'ST', sortOrder: 4 },
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
  {
    categoryCode: 'APPROVAL_STATUS',
    categoryName: 'Approval Status',
    description:
      "Decision status for approval-service's approval_requests.decision_status_lookup_id — replaces the former ApprovalRequestStatus Postgres enum with lookup-value rows (cross-service scalar FK per the forklift rule).",
    values: [
      { valueCode: 'PENDING', valueLabel: 'Pending', sortOrder: 0 },
      { valueCode: 'APPROVED', valueLabel: 'Approved', sortOrder: 1 },
      { valueCode: 'REJECTED', valueLabel: 'Rejected', sortOrder: 2 },
      { valueCode: 'AUTO_LAPSED', valueLabel: 'Auto-lapsed', sortOrder: 3 },
      { valueCode: 'CANCELLED', valueLabel: 'Cancelled', sortOrder: 4 },
    ],
  },
  {
    categoryCode: 'RISK_CATEGORY',
    categoryName: 'Risk Category',
    description:
      "Overall risk category for a beneficiary case, mirroring risk-referral-service's " +
      'OverallRiskCategory Postgres enum as a downloadable master list for the Supervisor app.',
    values: [
      { valueCode: 'NORMAL', valueLabel: 'Normal', sortOrder: 0 },
      { valueCode: 'LOW', valueLabel: 'Low', sortOrder: 1 },
      { valueCode: 'MEDIUM', valueLabel: 'Medium', sortOrder: 2 },
      { valueCode: 'HIGH', valueLabel: 'High', sortOrder: 3 },
      { valueCode: 'CRITICAL', valueLabel: 'Critical', sortOrder: 4 },
    ],
  },
  {
    categoryCode: 'RISK_TYPE',
    categoryName: 'Risk Type',
    description:
      "Program phase a risk condition/assessment applies to, mirroring risk-referral-service's " +
      'RiskPhase Postgres enum as a downloadable master list for the Supervisor app.',
    values: [
      { valueCode: 'REGISTRATION', valueLabel: 'Registration', sortOrder: 0 },
      { valueCode: 'ANC', valueLabel: 'ANC', sortOrder: 1 },
      { valueCode: 'DELIVERY', valueLabel: 'Delivery', sortOrder: 2 },
      { valueCode: 'PP', valueLabel: 'Postpartum (PP)', sortOrder: 3 },
      { valueCode: 'NN', valueLabel: 'Neonatal (NN)', sortOrder: 4 },
      { valueCode: 'INC', valueLabel: 'Infant & Child (INC)', sortOrder: 5 },
      { valueCode: 'CCV', valueLabel: 'Continuum of Care Visit (CCV)', sortOrder: 6 },
    ],
  },
  {
    categoryCode: 'VISIT_CATEGORY',
    categoryName: 'Visit Category',
    description:
      "Visit-schedule code, mirroring visit-form-service's VisitCodeType Postgres enum as a " +
      'downloadable master list for the Supervisor app.',
    values: [
      { valueCode: 'ANC', valueLabel: 'ANC', sortOrder: 0 },
      { valueCode: 'ANC_HR', valueLabel: 'ANC (High-Risk)', sortOrder: 1 },
      { valueCode: 'ANC_POST_EDD', valueLabel: 'ANC (Post-EDD)', sortOrder: 2 },
      { valueCode: 'DELIVERY', valueLabel: 'Delivery', sortOrder: 3 },
      { valueCode: 'PP', valueLabel: 'Postpartum (PP)', sortOrder: 4 },
      { valueCode: 'NN', valueLabel: 'Neonatal (NN)', sortOrder: 5 },
      { valueCode: 'INC', valueLabel: 'Infant & Child (INC)', sortOrder: 6 },
      { valueCode: 'INC_HR', valueLabel: 'Infant & Child (High-Risk)', sortOrder: 7 },
      { valueCode: 'CCV', valueLabel: 'Continuum of Care Visit', sortOrder: 8 },
      { valueCode: 'CCV_HR', valueLabel: 'Continuum of Care Visit (High-Risk)', sortOrder: 9 },
    ],
  },
  {
    categoryCode: 'ITEM_CATEGORY',
    categoryName: 'Item Category',
    description:
      "Inventory item category, mirroring supervisor-operations-service's InventoryItemCategory " +
      'Postgres enum as a downloadable master list for the Supervisor app.',
    values: [
      { valueCode: 'CONSUMABLE', valueLabel: 'Consumable', sortOrder: 0 },
      { valueCode: 'INSTRUMENT', valueLabel: 'Instrument', sortOrder: 1 },
    ],
  },
  {
    categoryCode: 'TRANSACTION_TYPE',
    categoryName: 'Transaction Type',
    description:
      "Inventory transaction type, mirroring supervisor-operations-service's " +
      'InventoryTransactionType Postgres enum as a downloadable master list for the Supervisor app.',
    values: [
      { valueCode: 'HANDOVER', valueLabel: 'Handover', sortOrder: 0 },
      { valueCode: 'RETURNED', valueLabel: 'Returned', sortOrder: 1 },
      { valueCode: 'PERMANENT_DAMAGED', valueLabel: 'Permanently Damaged', sortOrder: 2 },
      { valueCode: 'MISPLACED', valueLabel: 'Misplaced', sortOrder: 3 },
      { valueCode: 'CONSUMED', valueLabel: 'Consumed', sortOrder: 4 },
    ],
  },
  {
    categoryCode: 'GATHERING_TYPE',
    categoryName: 'Gathering Type',
    description:
      "Supervisor event type, mirroring supervisor-operations-service's SupervisorEventType " +
      'Postgres enum as a downloadable master list for the Supervisor app.',
    values: [
      { valueCode: 'MEETING', valueLabel: 'Meeting', sortOrder: 0 },
      { valueCode: 'TRAINING', valueLabel: 'Training', sortOrder: 1 },
    ],
  },
  {
    categoryCode: 'GATHERING_STATUS',
    categoryName: 'Gathering Status',
    description:
      "Supervisor event status, mirroring supervisor-operations-service's SupervisorEventStatus " +
      'Postgres enum as a downloadable master list for the Supervisor app.',
    values: [
      { valueCode: 'SCHEDULED', valueLabel: 'Scheduled', sortOrder: 0 },
      { valueCode: 'COMPLETED', valueLabel: 'Completed', sortOrder: 1 },
      { valueCode: 'CANCELLED', valueLabel: 'Cancelled', sortOrder: 2 },
    ],
  },
  {
    categoryCode: 'LANGUAGE',
    categoryName: 'Language',
    description:
      'App-wide supported language set (SRS Appendix I "Language Support" — English and ' +
      'Marathi only for initial release, Hindi removed from scope, default English). Exposed ' +
      "as a downloadable master list at /risk-languages for the Supervisor app; this is the app's " +
      'general language toggle, not risk-specific translated content, which does not exist as ' +
      'structured data anywhere in this codebase.',
    values: [
      { valueCode: 'EN', valueLabel: 'English', sortOrder: 0 },
      { valueCode: 'MR', valueLabel: 'Marathi', sortOrder: 1 },
    ],
  },
  {
    categoryCode: 'UOM',
    categoryName: 'Unit of Measure',
    description:
      'PROVISIONAL — placeholder pending a real source document, same as BENEFICIARY_TYPE ' +
      'above. inventory_items.unit is deliberately free text (see ERD) and is NOT constrained ' +
      'by this list; these are advisory values for a Supervisor-app picker only.',
    values: [
      { valueCode: 'PIECE', valueLabel: 'Piece', sortOrder: 0 },
      { valueCode: 'BOX', valueLabel: 'Box', sortOrder: 1 },
      { valueCode: 'STRIP', valueLabel: 'Strip', sortOrder: 2 },
      { valueCode: 'BOTTLE', valueLabel: 'Bottle', sortOrder: 3 },
      { valueCode: 'PACKET', valueLabel: 'Packet', sortOrder: 4 },
      { valueCode: 'KG', valueLabel: 'Kilogram', sortOrder: 5 },
      { valueCode: 'GRAM', valueLabel: 'Gram', sortOrder: 6 },
      { valueCode: 'LITRE', valueLabel: 'Litre', sortOrder: 7 },
      { valueCode: 'ML', valueLabel: 'Millilitre', sortOrder: 8 },
    ],
  },
];

/**
 * One seed-user env var per role — SAKHI/SUPERVISOR/MANAGER/ADMIN — each a
 * JSON array of `{ username, password, displayName }`. Kept in one place so
 * seed.ts (parsing/validation) and its spec share the same source of truth
 * for which env vars exist and their DB role code.
 *
 * mobileNumber is NOT read from these env vars: it's a NOT NULL UNIQUE `users`
 * column but plays no role in login (login is username + password only, per
 * the SRS), so seed.ts derives a deterministic placeholder per role+index
 * instead of asking every environment to supply one.
 */
export const SEED_USER_ENV_VARS: { envVar: string; roleCode: string; mobileOffset: number }[] = [
  { envVar: 'SAKHI', roleCode: 'SAKHI', mobileOffset: 0 },
  { envVar: 'SUPERVISOR', roleCode: 'SUPERVISOR', mobileOffset: 100 },
  { envVar: 'MANAGER', roleCode: 'MANAGER', mobileOffset: 200 },
  { envVar: 'ADMIN', roleCode: 'ADMIN', mobileOffset: 300 },
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
