import type { CrossFieldRule, FormField } from './dto/form-field.dto';

export function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** Evaluates SRS Category 5 skip logic for one field against the submitted formData. */
export function isVisible(field: FormField, formData: Record<string, unknown>): boolean {
  if (!field.visibleWhen) return true;
  const actual = formData[field.visibleWhen.field];
  switch (field.visibleWhen.operator) {
    case 'eq':
      return actual === field.visibleWhen.value;
    case 'gte':
      return Number(actual) >= Number(field.visibleWhen.value);
    case 'lt':
      return Number(actual) < Number(field.visibleWhen.value);
    case 'isSet':
      return !isEmpty(actual);
    default:
      return true;
  }
}

/**
 * Checks required fields (SRS line 1150), numeric ranges (SRS Category 2),
 * and cross-field consistency (SRS Category 3) against submitted formData.
 * Date rules (Category 1) are deliberately not checked here — see the
 * forms API design doc §7. Fields hidden by skip logic (Category 5) or
 * computed by the system (Category 4) are excluded from the required check.
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
    if (field.computedFrom) continue;
    if (!isVisible(field, formData)) continue;

    const value = formData[field.question_code];
    if (field.required && isEmpty(value)) {
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
      } else if (values.reduce((total, v) => total + v, 0) !== target) {
        violations.push(`${rule.fields.join(' + ')} must equal ${rule.equals}`);
      }
    }
  }

  return violations;
}
