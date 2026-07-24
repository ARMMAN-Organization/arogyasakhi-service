import { buildFormAnswers } from './form.mapper';
import type { FormField } from './dto/form-field.dto';
import { BENEFICIARY_DUPLICATED_FIELD_CODES } from './beneficiary-duplicated-fields';
import { REGISTRATION_FORMS } from './registration-forms.seed-data';

/** Minimal FormField factory — only the fields buildFormAnswers reads. */
function field(question_code: string, input_type: string): FormField {
  return { question_code, label: question_code, input_type, required: false };
}

describe('buildFormAnswers', () => {
  it('routes text/select/radio fields to answer_value_text', () => {
    const fields = [
      field('who_owns_the_phone', 'select'),
      field('remarks', 'text'),
      field('malnutrition', 'radio'),
    ];
    const rows = buildFormAnswers(fields, {
      who_owns_the_phone: 'asha',
      remarks: 'note',
      malnutrition: 'no',
    });

    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldCode: 'who_owns_the_phone', answerValueText: 'asha' }),
        expect.objectContaining({ fieldCode: 'remarks', answerValueText: 'note' }),
        expect.objectContaining({ fieldCode: 'malnutrition', answerValueText: 'no' }),
      ]),
    );
    // Only the text column is populated.
    expect(rows).toContainEqual(
      expect.objectContaining({
        fieldCode: 'who_owns_the_phone',
        answerValueNumber: null,
        answerValueJson: null,
      }),
    );
  });

  it('routes number/integer fields to answer_value_number, coercing string digits', () => {
    const fields = [field('family_members', 'integer'), field('gestational_age_weeks', 'number')];
    const rows = buildFormAnswers(fields, { family_members: '6', gestational_age_weeks: 12 });

    expect(rows).toContainEqual(
      expect.objectContaining({ fieldCode: 'family_members', answerValueNumber: 6 }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ fieldCode: 'gestational_age_weeks', answerValueNumber: 12 }),
    );
  });

  it('routes date fields to answer_value_date', () => {
    // date_of_visit (not lmp_date/edd) — kept distinct from the
    // beneficiary-duplicated fields exercised in the section below.
    const rows = buildFormAnswers([field('date_of_visit', 'date')], {
      date_of_visit: '2026-06-10',
    });
    const d = rows[0].answerValueDate;
    expect(d).toBeInstanceOf(Date);
    expect((d as Date).toISOString().slice(0, 10)).toBe('2026-06-10');
  });

  it('routes boolean fields to answer_value_bool, coercing "true"/"yes"', () => {
    const fields = [field('consent_audio', 'boolean'), field('did_we_receive_consent', 'boolean')];
    const rows = buildFormAnswers(fields, { consent_audio: 'true', did_we_receive_consent: 'yes' });

    expect(rows).toContainEqual(
      expect.objectContaining({ fieldCode: 'consent_audio', answerValueBool: true }),
    );
    expect(rows).toContainEqual(
      expect.objectContaining({ fieldCode: 'did_we_receive_consent', answerValueBool: true }),
    );
  });

  it('stores multi-select array values in answer_value_json', () => {
    const rows = buildFormAnswers([field('td_dose', 'multiselect')], {
      td_dose: ['none_received_yet'],
    });
    expect(rows[0].answerValueJson).toEqual(['none_received_yet']);
    expect(rows[0].answerValueText).toBeNull();
  });

  it('stores an array value as JSON even when the field is not in the schema', () => {
    const rows = buildFormAnswers([], { complications: ['yes_miscarriage'] });
    expect(rows[0].answerValueJson).toEqual(['yes_miscarriage']);
  });

  it('sets fieldCode to the question_code and is_indexed=false', () => {
    const rows = buildFormAnswers([field('religion', 'select')], { religion: 'sikh' });
    expect(rows[0].fieldCode).toBe('religion');
    expect(rows[0].isIndexed).toBe(false);
  });

  it('writes no row for a schema field absent or null in formData', () => {
    const fields = [field('religion', 'select'), field('remarks', 'text')];
    const rows = buildFormAnswers(fields, { religion: 'sikh', remarks: null });
    expect(rows).toHaveLength(1);
    expect(rows[0].fieldCode).toBe('religion');
  });

  it('preserves a value present in formData but not declared in the schema (never dropped)', () => {
    const rows = buildFormAnswers([], { surprise_field: 'value' });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(
      expect.objectContaining({ fieldCode: 'surprise_field', answerValueText: 'value' }),
    );
  });

  it('falls back to answer_value_text when a number field gets a non-numeric string', () => {
    const rows = buildFormAnswers([field('family_members', 'number')], { family_members: 'abc' });
    expect(rows[0].answerValueNumber).toBeNull();
    expect(rows[0].answerValueText).toBe('abc');
  });

  it('returns an empty array for empty formData', () => {
    expect(buildFormAnswers([field('religion', 'select')], {})).toEqual([]);
  });

  describe('beneficiary-duplicated fields', () => {
    it('writes no row for a field already stored by beneficiary creation', () => {
      const fields = [
        field('beneficiary_address', 'text'),
        field('lmp_date', 'date'),
        field('gravida', 'number'),
      ];
      const rows = buildFormAnswers(fields, {
        beneficiary_address: '123 Main St',
        lmp_date: '2026-06-10',
        gravida: 2,
      });
      expect(rows).toEqual([]);
    });

    it('still writes rows for non-duplicate fields alongside skipped duplicates', () => {
      const fields = [
        field('beneficiary_address', 'text'), // duplicate -> skipped
        field('phone_owner', 'select'), // not a duplicate -> kept
      ];
      const rows = buildFormAnswers(fields, {
        beneficiary_address: '123 Main St',
        phone_owner: 'SELF',
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual(
        expect.objectContaining({ fieldCode: 'phone_owner', answerValueText: 'SELF' }),
      );
    });

    it('does not skip a similarly-named field that is not on the duplicate list', () => {
      // "sickle_cell_status" is not duplicated with beneficiary-service; a
      // similarly health-history-flavored field must not be caught by a
      // partial/fuzzy match against the duplicate list.
      const rows = buildFormAnswers([field('sickle_cell_status', 'text')], {
        sickle_cell_status: 'AA',
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toEqual(
        expect.objectContaining({ fieldCode: 'sickle_cell_status', answerValueText: 'AA' }),
      );
    });

    it('every code in BENEFICIARY_DUPLICATED_FIELD_CODES matches a real seeded question_code', () => {
      // Guards against the two lists drifting apart silently: this list is a
      // manually-maintained mirror of the MOTHER_REGISTRATION form actually
      // seeded in registration-forms.seed-data.ts (which itself mirrors
      // beneficiary-service's create-beneficiary DTO). If either side renames
      // a question_code without updating the other, this test fails loudly
      // instead of the exclusion silently becoming a no-op for the renamed
      // field.
      const motherRegistrationForm = REGISTRATION_FORMS.find(
        (f) => f.formCode === 'MOTHER_REGISTRATION',
      );
      const seededCodes = new Set(
        (motherRegistrationForm?.fields ?? []).map((f) => f.question_code),
      );

      for (const code of BENEFICIARY_DUPLICATED_FIELD_CODES) {
        expect(seededCodes.has(code)).toBe(true);
      }
    });
  });
});
