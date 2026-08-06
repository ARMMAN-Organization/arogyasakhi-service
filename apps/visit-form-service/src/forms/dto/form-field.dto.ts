import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

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
 * cross-field-rule.dto.ts) are the only other SRS-named categories; date
 * rules are deliberately NOT modeled here yet (see the forms API design doc
 * §7 — which comparison field a date rule reads from isn't specified).
 */
export const formFieldSchema = z
  .object({
    question_code: z.string().trim().min(1),
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
    visibleWhen: z
      .object({
        field: z.string().trim().min(1),
        operator: z.enum(['eq', 'gte', 'lt', 'isSet']),
        // Bare z.any() has no inferable OpenAPI type — annotated so the
        // OpenAPI generator doesn't throw when this schema is used as a
        // documented request/response body (see createDocumentedRouter()).
        value: z.any().openapi({ type: 'object' }).optional(),
      })
      .optional(),
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
  })
  .strict();

export type FormField = z.infer<typeof formFieldSchema>;

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
  ])
  .openapi({ type: 'object' });

export type CrossFieldRule = z.infer<typeof crossFieldRuleSchema>;

export const validationJsonSchema = z.array(crossFieldRuleSchema);
