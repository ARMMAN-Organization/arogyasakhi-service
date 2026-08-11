import { createHash } from 'node:crypto';
import type { FormField } from './dto/form-field.dto';
import { BENEFICIARY_DUPLICATED_FIELD_CODES } from './beneficiary-duplicated-fields';

/** SHA-256 of the schema JSON, stored on form_versions.checksum for change detection. */
export function computeChecksum(schemaJson: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(schemaJson)).digest();
}

/** The subset of FormVersion columns a client is allowed to see. */
export interface FormVersionRow {
  id: string;
  formDefinitionId: string;
  versionNo: string;
  schemaJson: unknown;
  validationJson: unknown;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  publishedByUserId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  // Only present when the query joined formDefinition (see
  // form.repository.ts's findActiveVersion) — undefined otherwise (e.g.
  // createDraft/updateDraft/publish, which don't need it).
  formDefinition?: { riskRuleSetId: string | null };
}

/**
 * Projects a raw form_versions row down to exactly the fields the API
 * exposes (matches formVersionSchema in form.controller.ts). Drops internal
 * columns — notably the binary `checksum`, plus createdByUserId/
 * updatedByUserId/isDeleted/deletedAt — so they never leak into a response
 * even though the Prisma row carries them. Surfaces riskRuleSetId (via the
 * joined formDefinition) so a client can resolve formCode -> rule set ->
 * rulesJson in one call to GET /forms/:formCode/active-version, instead of
 * a separate lookup against form_definitions.
 */
export function toApiFormVersion<T extends FormVersionRow>(v: T) {
  return {
    id: v.id,
    formDefinitionId: v.formDefinitionId,
    versionNo: v.versionNo,
    schemaJson: v.schemaJson,
    validationJson: v.validationJson,
    effectiveFrom: v.effectiveFrom,
    effectiveTo: v.effectiveTo,
    publishedByUserId: v.publishedByUserId,
    status: v.status,
    createdAt: v.createdAt,
    updatedAt: v.updatedAt,
    riskRuleSetId: v.formDefinition?.riskRuleSetId ?? null,
  };
}

/** The subset of form_submissions columns a client is allowed to see. */
export interface FormSubmissionRow {
  id: string;
  formVersionId: string;
  beneficiaryId: string;
  visitId: string | null;
  submittedByUserId: string;
  submittedAt: Date;
  localSubmissionUuid: string;
  formDataJson: unknown;
  validationStatus: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One decomposed answer, ready to insert into form_answers. Exactly one
 * typed value column is populated per row (the rest stay null), chosen from
 * the field's declared `input_type` — this is the ERD's normalized,
 * per-question projection of the raw `form_data_json` payload (ERD §"design
 * stance", line 19) that makes every submitted field individually queryable.
 */
export interface FormAnswerRow {
  fieldCode: string;
  answerValueText: string | null;
  answerValueNumber: number | null;
  answerValueDate: Date | null;
  answerValueBool: boolean | null;
  answerValueJson: unknown | null;
  isIndexed: boolean;
}

/** input_type values (lower-cased) that route to answer_value_text. */
const TEXT_TYPES = new Set(['text', 'select', 'radio', 'dropdown', 'media', 'photo']);
/** input_type values that route to answer_value_number. */
const NUMBER_TYPES = new Set(['number', 'integer', 'int', 'decimal']);
/** input_type values that route to answer_value_date. */
const DATE_TYPES = new Set(['date', 'datetime']);
/** input_type values that route to answer_value_bool. */
const BOOL_TYPES = new Set(['boolean', 'bool', 'checkbox']);
/** input_type values that route to answer_value_json (array-valued). */
const JSON_TYPES = new Set(['multiselect', 'multi_select', 'checkbox_group']);

/** An empty row with all typed columns null — one gets filled per field. */
function emptyRow(fieldCode: string): FormAnswerRow {
  return {
    fieldCode,
    answerValueText: null,
    answerValueNumber: null,
    answerValueDate: null,
    answerValueBool: null,
    answerValueJson: null,
    isIndexed: false,
  };
}

/** Coerces the App-Form's string-encoded numbers ("123") to a number, or null. */
function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Coerces the App-Form's string-encoded booleans ("true"/"false") to bool, or null. */
function toBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase();
    if (v === 'true' || v === 'yes' || v === '1') return true;
    if (v === 'false' || v === 'no' || v === '0') return false;
  }
  return null;
}

/** Coerces a value to a Date (calendar day), or null when unparseable. */
function toDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && value.trim() !== '') {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Decomposes a submission's `formData` into one normalized form_answers row
 * per submitted field, choosing the typed value column from each field's
 * declared `input_type` in the active version's schema_json.
 *
 * Schema-driven by design (no hardcoded field list) so the same code serves
 * every form — MOTHER_REGISTRATION, CHILD_REGISTRATION, and visit forms.
 * Robustness rules, so answer decomposition can never fail an otherwise-valid
 * submission:
 * - A field declared in the schema but absent/null in formData → no row.
 * - A value present in formData but NOT declared in the schema → preserved in
 *   answer_value_json (never silently dropped).
 * - A value that fails its type's coercion (e.g. "abc" for a number) → falls
 *   back to answer_value_text (or json for objects/arrays), never throws.
 * Multi-select fields are stored as a JSON array in answer_value_json (ERD
 * normalized form; per-option Boolean expansion, SRS J.3, is deliberately not
 * done here — a documented follow-up if reporting needs it).
 *
 * Fields listed in BENEFICIARY_DUPLICATED_FIELD_CODES are skipped entirely —
 * their values are already persisted as structured beneficiary-service
 * columns at enrollment, so storing them again here would just be a second,
 * independently-editable copy. They remain in the raw formData/form_data_json
 * (never stripped from the source-of-truth payload — only from this
 * normalized projection).
 */
export function buildFormAnswers(
  fields: FormField[],
  formData: Record<string, unknown>,
): FormAnswerRow[] {
  const byCode = new Map(fields.map((f) => [f.question_code, f]));
  const rows: FormAnswerRow[] = [];

  for (const [code, value] of Object.entries(formData)) {
    if (value === null || value === undefined) continue;
    if (BENEFICIARY_DUPLICATED_FIELD_CODES.has(code)) continue;

    const row = emptyRow(code);
    const field = byCode.get(code);
    const inputType = field?.input_type?.trim().toLowerCase();

    if (Array.isArray(value) || (field && JSON_TYPES.has(inputType ?? ''))) {
      // Multi-select / any array value → JSON array, verbatim.
      row.answerValueJson = value;
    } else if (typeof value === 'object') {
      // Nested object with no scalar column — keep it whole.
      row.answerValueJson = value;
    } else if (inputType && NUMBER_TYPES.has(inputType)) {
      const n = toNumber(value);
      if (n !== null) row.answerValueNumber = n;
      else row.answerValueText = String(value);
    } else if (inputType && DATE_TYPES.has(inputType)) {
      const d = toDate(value);
      if (d !== null) row.answerValueDate = d;
      else row.answerValueText = String(value);
    } else if (inputType && BOOL_TYPES.has(inputType)) {
      const b = toBool(value);
      if (b !== null) row.answerValueBool = b;
      else row.answerValueText = String(value);
    } else if (inputType && TEXT_TYPES.has(inputType)) {
      row.answerValueText = String(value);
    } else {
      // Field not in schema, or an unrecognized input_type: never drop it.
      // Scalars go to text; anything else already handled above as json.
      row.answerValueText = String(value);
    }

    rows.push(row);
  }

  return rows;
}

/**
 * Projects a raw form_submissions row down to the API-exposed fields
 * (matches formSubmissionSchema in form.controller.ts). Drops internal
 * columns ruleVersionId/syncBatchId/createdByUserId/updatedByUserId/
 * isDeleted/deletedAt so they never leak into a response.
 */
export function toApiFormSubmission<T extends FormSubmissionRow>(s: T) {
  return {
    id: s.id,
    formVersionId: s.formVersionId,
    beneficiaryId: s.beneficiaryId,
    visitId: s.visitId,
    submittedByUserId: s.submittedByUserId,
    submittedAt: s.submittedAt,
    localSubmissionUuid: s.localSubmissionUuid,
    formData: s.formDataJson,
    validationStatus: s.validationStatus,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}
