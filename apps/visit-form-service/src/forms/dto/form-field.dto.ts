import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

/** One SRS Category 5 skip-logic condition — see visibleWhen below. */
export const visibleWhenConditionSchema = z.object({
  field: z.string().trim().min(1),
  // 'contains' checks a multiselect answer (an array of value_codes)
  // for membership — e.g. show a dose date field only when its
  // checkbox is one of the checked options on has_the_women_received_td_dose.
  operator: z.enum(['eq', 'gte', 'lt', 'isSet', 'contains']),
  // Bare z.any() has no inferable OpenAPI type — annotated so the
  // OpenAPI generator doesn't throw when this schema is used as a
  // documented request/response body (see createDocumentedRouter()).
  value: z.any().openapi({ type: 'object' }).optional(),
});

/**
 * Shape of one entry in `form_versions.schema_json`. Only the parts confirmed
 * by docs/Arogya_Sakhi_Database_Design_ERD_Table_Definitions.docx.md §4.0 (the
 * worked example) and docs/Arogya_Sakhi_SRS_v3.0.md FR-S-4.7 are given a typed
 * shape here — no field beyond what those two docs describe:
 * - question_code/label/input_type/lookup_category_code/options: the ERD's own example.
 * - required: SRS line 1150 ("Required-field validation shall run both on
 *   device and server") + ERD's design-stance note that schema stores
 *   "required flags" — the key name itself was undocumented, this is where
 *   it's been placed.
 * - numericRange: SRS Category 2 (exact per-field ranges are admin-entered
 *   data, not hardcoded here — only the {min,max} shape is fixed).
 * - exactLength: SRS Category 2, fixed digit-count fields (e.g. a 10-digit
 *   mobile number) — distinct from numericRange, which bounds a value
 *   rather than its digit length.
 * - visibleWhen: SRS Category 5 (conditional field visibility / skip logic).
 * - computedFrom: SRS Category 4 (auto-calculated fields that must not be
 *   manually entered) — closed set of the exact formulas SRS names.
 * - captureMode / requirePlaybackComplete: SRS Category 6 (media/consent gating).
 * - section: client-side tab grouping (e.g. "Consent", "Personal Info",
 *   "Health History"), restoring the old static enrollment screen's stepper
 *   UX for the dynamic form. Plain string label; tab order on the client is
 *   first-seen order in the field array, not a separate sort field. Fields
 *   with no section fall into a client-rendered catch-all tab — no special
 *   handling needed here beyond allowing the field to be absent.
 * Categories 1 (date rules) and 3 (cross-field, on validation_json — see
 * crossFieldRuleSchema below) are the only other SRS-named categories.
 * - dateRule: SRS Category 1 — future-date rejection and date-vs-date
 *   comparisons against another field on the same submission (e.g. LMP
 *   must be on/after registration date minus 240 days). All bounds are
 *   inclusive: a value exactly on the boundary is valid.
 * - pattern: a closed set of named character-class checks (never a raw
 *   regex in JSON) — e.g. rejecting digits/symbols in a name field per
 *   Registration_PW_D Q19 ("should not accept any special characters").
 */
export const formFieldSchema = z
  .object({
    // Max 120 matches form_answers.field_code's DB column (VarChar(120), see
    // prisma/schema.prisma) — question_code is written there verbatim on
    // every submission (see buildFormAnswers). Enforced here, at
    // draft-save/publish time, so an over-length code is rejected as a
    // clean validation error immediately, rather than surfacing as a
    // Prisma P2000 500 the first time a real Sakhi submits an answer for
    // it (this happened in production-equivalent testing: a 135-char
    // question_code on MOTHER_REGISTRATION passed schema validation
    // uncaught and only failed at submission time).
    question_code: z.string().trim().min(1).max(120),
    label: z.string().trim().min(1),
    input_type: z.string().trim().min(1),
    required: z.boolean(),
    lookup_category_code: z.string().trim().min(1).nullable().optional(),
    options: z
      .array(
        z.object({
          value_code: z.string().trim().min(1),
          label: z.string().trim().min(1),
          sort_order: z.number().int(),
        }),
      )
      .optional(),
    numericRange: z
      .object({ min: z.number(), max: z.number() })
      .refine((r) => r.min <= r.max, { message: 'numericRange.min must be <= max' })
      .optional(),
    // Fixed digit-count fields (e.g. a 10-digit mobile number) — distinct from
    // numericRange, which bounds a value rather than its digit length.
    exactLength: z.number().int().positive().optional(),
    // A single {field,operator,value} condition ONLY — never an array.
    // The mobile client's FormVisibilityEvaluator does not parse an
    // array-of-conditions shape and crashes the whole form load if it sees
    // one (see the ANC_VISIT/INFANT_VISIT incident this schema-level
    // rejection follows: array-form visibleWhen was briefly published to
    // AND a field's own condition with "met beneficiary = yes", and every
    // Sakhi got "We couldn't load this visit's data" with no way to
    // submit). Rejected here at the schema level — not just absent from
    // current seed content — so this can't be reintroduced via the live
    // admin form-authoring PATCH endpoint (`PATCH
    // /admin/forms/:formCode/versions/:versionId`) either, for ANY form,
    // not only the two that already had the incident. Re-allow the array
    // shape only once mobile ships a parser for it, not before.
    visibleWhen: visibleWhenConditionSchema.optional(),
    computedFrom: z
      .enum([
        'EDD_FROM_LMP',
        'GESTATIONAL_AGE_AT_REGISTRATION',
        'GESTATIONAL_AGE_AT_VISIT',
        'BMI',
        'GESTATIONAL_WEIGHT_GAIN',
        'NUTRITIONAL_ZSCORE',
        'CHILD_AGE_MONTHS',
        'UNIQUE_ID',
        'AGE_FROM_DOB',
      ])
      .optional(),
    captureMode: z.enum(['LIVE_CAMERA_ONLY']).optional(),
    requirePlaybackComplete: z.boolean().optional(),
    section: z.string().trim().min(1).optional(),
    // SRS Category 1 — date-vs-date comparisons, evaluated only when this
    // field and the referenced field both have a value (a missing value is
    // the required-field check's concern, not this rule's). All comparisons
    // are inclusive of the boundary day.
    dateRule: z
      .object({
        notFuture: z.boolean().optional(),
        notBefore: z
          .object({ field: z.string().trim().min(1), offsetDays: z.number().int().optional() })
          .optional(),
        notAfter: z
          .object({ field: z.string().trim().min(1), offsetDays: z.number().int().optional() })
          .optional(),
        minDaysFrom: z
          .object({ field: z.string().trim().min(1), days: z.number().int() })
          .optional(),
        maxDaysFrom: z
          .object({ field: z.string().trim().min(1), days: z.number().int() })
          .optional(),
      })
      .optional(),
    // Named character-class checks — never a raw regex in JSON, to keep
    // seed data free of arbitrary executable-ish patterns.
    pattern: z.enum(['NAME_NO_SPECIAL_CHARS']).optional(),
    // SRS FR-S-13.4: "Learn More content also accessible contextually within
    // form screens — relevant content appears at the bottom of specific form
    // fields." Resolves via cms-content-service's GET /learn-more/topics/:code.
    // Optional/nullable and unused by any seeded form today — ARMMAN has not
    // yet provided the real Learn More topic codes (SRS Open Item 12) — added
    // now so a future PATCH to a form version can attach a real code without
    // a second schema migration.
    learnMoreTopicCode: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export type FormField = z.infer<typeof formFieldSchema>;
export type VisibleWhenCondition = z.infer<typeof visibleWhenConditionSchema>;

export const schemaJsonSchema = z.array(formFieldSchema).min(1);

/**
 * Shape of one entry in `form_versions.validation_json` — SRS Category 3,
 * cross-field consistency. SRS names exactly four rules of these two
 * fixed shapes (Para <= Gravida, Abortions <= Gravida, Dead children <=
 * Live births, Live births + Stillbirths + Abortions + 1 = Gravida — the +1
 * accounts for the current pregnancy) — SUM_EQUALS carries an optional
 * `offset` for that last rule's constant. ANY_OF_REQUIRED is a fifth rule,
 * added for MOTHER_REGISTRATION's date_of_birth/age_of_the_beneficiary pair
 * (either one satisfies the requirement) — see CR037beneficiaryagedobfieldgap.md.
 * EXCLUSIVE_OPTION is a sixth rule — Registration_PW_D's repeated "if 'None'/
 * 'No known condition' is selected, disable all other options" checkbox
 * groups (Q43, Q44, Q58). The client-side disabling itself is a mobile-app
 * concern; this rule is the server-side check that the *submitted* answer
 * never combines an exclusive value with anything else.
 * REQUIRED_IF_SELECTED is a seventh rule — the recurring "☐ <option>; Date:"
 * multiselect_date pattern (Registration_PW_D's Td dose, Q49 vaccination at
 * birth), where the doc requires each option's paired date field be filled
 * whenever that option is checked (e.g. "If marked to any option other than
 * 'None' then date is mandatory").
 */
// A discriminated union has no inferable OpenAPI type on its own — annotated
// so the OpenAPI generator doesn't throw when this schema is used as a
// documented request/response body (see createDocumentedRouter()).
export const crossFieldRuleSchema = z
  .discriminatedUnion('rule', [
    z.object({ rule: z.literal('LTE'), fields: z.tuple([z.string(), z.string()]) }).strict(),
    z
      .object({
        rule: z.literal('SUM_EQUALS'),
        fields: z.array(z.string().trim().min(1)).min(2),
        equals: z.string().trim().min(1),
        // Constant added to the field sum before comparing — e.g. Gravida =
        // live births + stillbirths + abortions + 1 (the current pregnancy).
        offset: z.number().int().optional(),
      })
      .strict(),
    z
      .object({
        rule: z.literal('ANY_OF_REQUIRED'),
        fields: z.array(z.string().trim().min(1)).min(2),
      })
      .strict(),
    z
      .object({
        rule: z.literal('EXCLUSIVE_OPTION'),
        field: z.string().trim().min(1),
        exclusiveValues: z.array(z.string().trim().min(1)).min(1),
      })
      .strict(),
    z
      .object({
        rule: z.literal('REQUIRED_IF_SELECTED'),
        field: z.string().trim().min(1),
        // Selected value_code -> the question_code of its paired date field.
        optionFieldMap: z.record(z.string(), z.string().trim().min(1)),
      })
      .strict(),
  ])
  .openapi({ type: 'object' });

export type CrossFieldRule = z.infer<typeof crossFieldRuleSchema>;

export const validationJsonSchema = z.array(crossFieldRuleSchema);
