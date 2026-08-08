import type { CrossFieldRule, FormField, VisibleWhenCondition } from './dto/form-field.dto';

export function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** Named character-class checks for FormField.pattern — never a raw regex in JSON. */
const PATTERN_REGEXES: Record<string, RegExp> = {
  // Letters (any script) plus combining marks (\p{M} — required for
  // Devanagari and other Indic scripts, where vowel signs are marks, not
  // letters), spaces, apostrophes, and periods. Rejects digits and symbols
  // per Registration_PW_D Q19 ("should not accept any special characters").
  NAME_NO_SPECIAL_CHARS: /^[\p{L}\p{M}\s'.]+$/u,
};

/** Whole calendar days between two dates (b - a), ignoring time-of-day. */
function daysBetween(a: Date, b: Date): number {
  const startOfDay = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((startOfDay(b) - startOfDay(a)) / (24 * 60 * 60 * 1000));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

/**
 * Evaluates SRS Category 1 date rules for one field against submitted
 * formData. Only runs when the field's own value and any referenced field's
 * value both parse as dates — a missing or invisible value is the
 * required-field/visibility check's concern, not this rule's. All bounds
 * are inclusive of the boundary day.
 */
function checkDateRule(field: FormField, formData: Record<string, unknown>): string[] {
  if (!field.dateRule || isEmpty(formData[field.question_code])) return [];

  const value = new Date(String(formData[field.question_code]));
  if (Number.isNaN(value.getTime())) return [`${field.question_code} must be a valid date`];

  const violations: string[] = [];
  const { notFuture, notBefore, notAfter, minDaysFrom, maxDaysFrom } = field.dateRule;

  if (notFuture && value.getTime() > Date.now()) {
    violations.push(`${field.question_code} must not be in the future`);
  }

  const resolveReference = (ref: { field: string; offsetDays?: number }): Date | null => {
    if (isEmpty(formData[ref.field])) return null;
    const referenced = new Date(String(formData[ref.field]));
    if (Number.isNaN(referenced.getTime())) return null;
    return ref.offsetDays ? addDays(referenced, ref.offsetDays) : referenced;
  };

  if (notBefore) {
    const bound = resolveReference(notBefore);
    if (bound && value.getTime() < bound.getTime()) {
      violations.push(`${field.question_code} must not be before ${notBefore.field}`);
    }
  }

  if (notAfter) {
    const bound = resolveReference(notAfter);
    if (bound && value.getTime() > bound.getTime()) {
      violations.push(`${field.question_code} must not be after ${notAfter.field}`);
    }
  }

  if (minDaysFrom && !isEmpty(formData[minDaysFrom.field])) {
    const reference = new Date(String(formData[minDaysFrom.field]));
    if (!Number.isNaN(reference.getTime()) && daysBetween(value, reference) < minDaysFrom.days) {
      violations.push(
        `${minDaysFrom.field} must be at least ${minDaysFrom.days} days after ${field.question_code}`,
      );
    }
  }

  if (maxDaysFrom && !isEmpty(formData[maxDaysFrom.field])) {
    const reference = new Date(String(formData[maxDaysFrom.field]));
    if (!Number.isNaN(reference.getTime()) && daysBetween(value, reference) > maxDaysFrom.days) {
      violations.push(
        `${maxDaysFrom.field} must be at most ${maxDaysFrom.days} days after ${field.question_code}`,
      );
    }
  }

  return violations;
}

function evaluateVisibilityCondition(
  condition: VisibleWhenCondition,
  formData: Record<string, unknown>,
): boolean {
  const actual = formData[condition.field];
  switch (condition.operator) {
    case 'eq':
      return actual === condition.value;
    case 'gte':
      return Number(actual) >= Number(condition.value);
    case 'lt':
      return Number(actual) < Number(condition.value);
    case 'isSet':
      return !isEmpty(actual);
    case 'contains':
      return Array.isArray(actual) && actual.includes(condition.value);
    default:
      return true;
  }
}

/**
 * Evaluates SRS Category 5 skip logic for one field against the submitted
 * formData. `visibleWhen` is a single {field,operator,value} condition only
 * — never an array — since the mobile client's FormVisibilityEvaluator
 * doesn't parse an array-of-conditions shape (see form-field.dto.ts's
 * visibleWhen doc comment).
 */
export function isVisible(field: FormField, formData: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true;
  return evaluateVisibilityCondition(field.visibleWhen, formData);
}

/**
 * Checks required fields (SRS line 1150), numeric ranges (SRS Category 2),
 * date rules (SRS Category 1), and cross-field consistency (SRS Category 3)
 * against submitted formData. Fields hidden by skip logic (Category 5) are
 * skipped entirely; fields computed by the system (Category 4) are exempt
 * from the required check only — if a value is submitted for one anyway,
 * its numericRange/exactLength/dateRule/pattern is still enforced.
 *
 * Returns the list of human-readable violations (empty = valid).
 */
export function validateSubmission(
  fields: FormField[],
  crossFieldRules: CrossFieldRule[],
  formData: Record<string, unknown>,
): string[] {
  const violations: string[] = [];

  for (const field of fields) {
    if (!isVisible(field, formData)) continue;

    const value = formData[field.question_code];
    // Computed fields are never required (the system derives them), but if a
    // client submits one anyway, its numericRange/exactLength must still hold.
    if (!field.computedFrom && field.required && isEmpty(value)) {
      violations.push(`Missing required field: ${field.question_code}`);
      continue;
    }

    if (field.numericRange && !isEmpty(value)) {
      const numeric = Number(value);
      if (
        Number.isNaN(numeric) ||
        numeric < field.numericRange.min ||
        numeric > field.numericRange.max
      ) {
        violations.push(
          `${field.question_code} must be between ${field.numericRange.min} and ${field.numericRange.max}`,
        );
      }
    }

    if (field.exactLength && !isEmpty(value) && String(value).length !== field.exactLength) {
      violations.push(`${field.question_code} must be exactly ${field.exactLength} digits`);
    }

    if (field.pattern && !isEmpty(value) && !PATTERN_REGEXES[field.pattern].test(String(value))) {
      violations.push(`${field.question_code} contains characters that are not allowed`);
    }

    violations.push(...checkDateRule(field, formData));
  }

  for (const rule of crossFieldRules) {
    if (rule.rule === 'LTE') {
      const [a, b] = rule.fields;
      // A field legitimately absent (optional, not yet answered) is not
      // this rule's concern — the required-field check above already
      // covers "missing". Only a *present but non-numeric* value is a
      // cross-field violation.
      if (isEmpty(formData[a]) || isEmpty(formData[b])) continue;
      const va = Number(formData[a]);
      const vb = Number(formData[b]);
      if (Number.isNaN(va) || Number.isNaN(vb)) {
        violations.push(`${a} and ${b} must both be numeric`);
      } else if (va > vb) {
        violations.push(`${a} must be <= ${b}`);
      }
    } else if (rule.rule === 'SUM_EQUALS') {
      const allFields = [...rule.fields, rule.equals];
      if (allFields.some((f) => isEmpty(formData[f]))) continue;
      const values = rule.fields.map((f) => Number(formData[f]));
      const target = Number(formData[rule.equals]);
      if (values.some((v) => Number.isNaN(v)) || Number.isNaN(target)) {
        violations.push(`${rule.fields.join(', ')} and ${rule.equals} must all be numeric`);
      } else if (values.reduce((total, v) => total + v, 0) + (rule.offset ?? 0) !== target) {
        const offsetSuffix = rule.offset ? ` + ${rule.offset}` : '';
        violations.push(`${rule.fields.join(' + ')}${offsetSuffix} must equal ${rule.equals}`);
      }
    } else if (rule.rule === 'ANY_OF_REQUIRED') {
      const allEmpty = rule.fields.every((f) => isEmpty(formData[f]));
      if (allEmpty) {
        violations.push(`At least one of ${rule.fields.join(', ')} must be answered`);
      }
    } else if (rule.rule === 'EXCLUSIVE_OPTION') {
      const answer = formData[rule.field];
      if (!Array.isArray(answer) || answer.length === 0) continue;
      const hasExclusive = answer.some((v) => rule.exclusiveValues.includes(v));
      const hasOther = answer.some((v) => !rule.exclusiveValues.includes(v));
      if (hasExclusive && hasOther) {
        violations.push(
          `${rule.field} cannot combine ${rule.exclusiveValues.join('/')} with any other option`,
        );
      }
    } else if (rule.rule === 'REQUIRED_IF_SELECTED') {
      const answer = formData[rule.field];
      if (!Array.isArray(answer)) continue;
      for (const [optionCode, dateField] of Object.entries(rule.optionFieldMap)) {
        if (answer.includes(optionCode) && isEmpty(formData[dateField])) {
          violations.push(`${dateField} is required when ${optionCode} is selected`);
        }
      }
    }
  }

  return violations;
}
