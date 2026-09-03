import { FORM_ANSWER_EDIT_ALLOWLIST, getEditableFieldCodes } from './form-answer-edit-allowlist';

/**
 * One assertion per SRS Appendix J.4 form/field pair
 * (docs/Arogya_Sakhi_SRS_v3.0.md:1849-1858), confirming the allowlist
 * contains the exact fieldCode(s) that SRS row's plain-English label maps
 * to, verified against the real seed JSON under
 * apps/visit-form-service/prisma/seed-data/*.json (see
 * form-answer-edit-allowlist.ts's own doc comment for the per-field
 * citations).
 */
describe('FORM_ANSWER_EDIT_ALLOWLIST', () => {
  describe('PW Registration (MOTHER_REGISTRATION)', () => {
    const allowlist = getEditableFieldCodes('MOTHER_REGISTRATION');

    it('includes Address (enter_the_beneficiary_address)', () => {
      expect(allowlist).toContain('enter_the_beneficiary_address');
    });

    it('includes Mobile (mobile_number)', () => {
      expect(allowlist).toContain('mobile_number');
    });

    it('includes Phone owner (who_owns_the_phone)', () => {
      expect(allowlist).toContain('who_owns_the_phone');
    });

    it('includes Gravida (gravida_total_number_of_pregnancies)', () => {
      expect(allowlist).toContain('gravida_total_number_of_pregnancies');
    });

    it('includes Para (para_number_of_births_after_24_weeks)', () => {
      expect(allowlist).toContain('para_number_of_births_after_24_weeks');
    });

    it('includes Living children (living_children)', () => {
      expect(allowlist).toContain('living_children');
    });

    it('includes Abortions (abortions_pregnancy_losses_before_24_weeks)', () => {
      expect(allowlist).toContain('abortions_pregnancy_losses_before_24_weeks');
    });

    it('includes Stillbirths (still_births)', () => {
      expect(allowlist).toContain('still_births');
    });

    it('includes Dead children (dead_children)', () => {
      expect(allowlist).toContain('dead_children');
    });

    it('includes Sickle Cell (have_you_been_detected_with_sickle_cell_disease_or_sickle_cell_trait_sct)', () => {
      expect(allowlist).toContain(
        'have_you_been_detected_with_sickle_cell_disease_or_sickle_cell_trait_sct',
      );
    });

    // Decision 2 (escalated ambiguity, resolved by product owner): LMP date
    // and EDD are excluded from this endpoint entirely — LMP correction has
    // its own dedicated approval-gated flow (Tasks 1/4), and EDD only ever
    // changes as a computed side effect of an approved LMP change, never as
    // a direct PATCH.
    it('excludes LMP date (lmp_date) — has its own approval-gated flow', () => {
      expect(allowlist).not.toContain('lmp_date');
    });

    it('excludes EDD (edd) — only changes as a computed side effect of an approved LMP change', () => {
      expect(allowlist).not.toContain('edd');
    });
  });

  describe('Infant Registration (CHILD_REGISTRATION)', () => {
    const allowlist = getEditableFieldCodes('CHILD_REGISTRATION');

    it('includes Caregiver name (caregiver_name_first_name_middle_name_last_name)', () => {
      expect(allowlist).toContain('caregiver_name_first_name_middle_name_last_name');
    });

    it('includes Mother DOB (mother_date_of_birth)', () => {
      expect(allowlist).toContain('mother_date_of_birth');
    });

    it('includes Address (enter_the_beneficiary_address)', () => {
      expect(allowlist).toContain('enter_the_beneficiary_address');
    });

    it('includes Mobile (mobile_number)', () => {
      expect(allowlist).toContain('mobile_number');
    });

    it('includes Phone owner (who_owns_the_phone)', () => {
      expect(allowlist).toContain('who_owns_the_phone');
    });

    it('includes Birth length (child_length_at_birth_in_cm)', () => {
      expect(allowlist).toContain('child_length_at_birth_in_cm');
    });

    it('includes Birth weight (child_weight_at_birth_in_kg)', () => {
      expect(allowlist).toContain('child_weight_at_birth_in_kg');
    });

    // Decision 1 (escalated ambiguity, resolved by product owner): no
    // "current length/weight at registration" fieldCode exists in
    // child-registration.json — both SRS-named concepts alias onto the same
    // birth-measurement fieldCodes rather than a second, invented field.
    it('aliases "Current length at registration" onto the same fieldCode as Birth length', () => {
      expect(allowlist).toContain('child_length_at_birth_in_cm');
      // Only one length-related fieldCode exists for this form — the alias
      // is represented by reuse, not a duplicate/second entry.
      expect(allowlist.filter((c) => c.includes('length'))).toEqual([
        'child_length_at_birth_in_cm',
      ]);
    });

    it('aliases "Current weight at registration" onto the same fieldCode as Birth weight', () => {
      expect(allowlist).toContain('child_weight_at_birth_in_kg');
      expect(allowlist.filter((c) => c.includes('weight'))).toEqual([
        'child_weight_at_birth_in_kg',
      ]);
    });
  });

  describe('Delivery / PP / Neonatal', () => {
    const deliveryAllowlist = getEditableFieldCodes('DELIVERY_VISIT');
    const neonatalAllowlist = getEditableFieldCodes('NEONATAL_VISIT');
    const ppAllowlist = getEditableFieldCodes('POSTPARTUM_VISIT');

    it('DELIVERY_VISIT includes Birth length for all three children', () => {
      expect(deliveryAllowlist).toEqual(
        expect.arrayContaining([
          'child1_birth_length_cm',
          'child2_birth_length_cm',
          'child3_birth_length_cm',
        ]),
      );
    });

    it('DELIVERY_VISIT includes Birth weight for all three children', () => {
      expect(deliveryAllowlist).toEqual(
        expect.arrayContaining([
          'child1_birth_weight_kg',
          'child2_birth_weight_kg',
          'child3_birth_weight_kg',
        ]),
      );
    });

    it('DELIVERY_VISIT includes cause/place/date of (neonatal) death for all three children', () => {
      expect(deliveryAllowlist).toEqual(
        expect.arrayContaining([
          'child1_cause_of_death',
          'child1_place_of_death',
          'child1_date_of_death',
          'child2_cause_of_death',
          'child2_place_of_death',
          'child2_date_of_death',
          'child3_cause_of_death',
          'child3_place_of_death',
          'child3_date_of_death',
        ]),
      );
    });

    it('NEONATAL_VISIT includes cause/place/date of neonatal death', () => {
      expect(neonatalAllowlist).toEqual(
        expect.arrayContaining(['cause_of_death', 'place_of_death', 'date_of_death']),
      );
    });

    it('POSTPARTUM_VISIT has no matching fields in its own schema, so it is empty', () => {
      expect(ppAllowlist).toEqual([]);
    });
  });

  describe('ANC Closure (ANC_CLOSURE_VISIT)', () => {
    const allowlist = getEditableFieldCodes('ANC_CLOSURE_VISIT');

    it('includes Closure reason (closure_reason)', () => {
      expect(allowlist).toContain('closure_reason');
    });

    it('includes Date of event (date_of_event)', () => {
      expect(allowlist).toContain('date_of_event');
    });

    it('includes Time of maternal death (maternal_death_time)', () => {
      expect(allowlist).toContain('maternal_death_time');
    });

    it('includes Cause of maternal death (maternal_death_cause)', () => {
      expect(allowlist).toContain('maternal_death_cause');
    });

    it('includes Place of maternal death (maternal_death_place)', () => {
      expect(allowlist).toContain('maternal_death_place');
    });

    it('includes Other specify (maternal_death_cause_other_specify)', () => {
      expect(allowlist).toContain('maternal_death_cause_other_specify');
    });
  });

  describe('Child Closure (CHILD_CLOSURE_VISIT)', () => {
    const allowlist = getEditableFieldCodes('CHILD_CLOSURE_VISIT');

    it('includes Closure reason (closure_reason)', () => {
      expect(allowlist).toContain('closure_reason');
    });

    it('includes Date of event (date_of_event)', () => {
      expect(allowlist).toContain('date_of_event');
    });

    it('includes Time of infant death (infant_death_time)', () => {
      expect(allowlist).toContain('infant_death_time');
    });

    it('includes Cause of infant death (infant_death_cause)', () => {
      expect(allowlist).toContain('infant_death_cause');
    });

    it('includes Place of infant death (infant_death_place)', () => {
      expect(allowlist).toContain('infant_death_place');
    });

    it('includes Other specify (infant_death_cause_other_specify)', () => {
      expect(allowlist).toContain('infant_death_cause_other_specify');
    });
  });

  describe('Infant Visits (INFANT_VISIT / INC_VISIT / CCV_VISIT)', () => {
    const vaccinationFieldCodes = [
      'bcg',
      'bcg_date',
      'opv_0',
      'opv_0_date',
      'hepatitis_b_birth_dose',
      'hepatitis_b_date_birth_dose',
      'vitamin_k',
      'vitamin_k_date',
      'opv_1',
      'opv_1_date',
      'pentavalent_1_dpt1',
      'pentavalent_1_dpt1_date',
      'ipv_1',
      'ipv_1_date',
      'rotavirus1',
      'rotavirus1_date',
      'pcv1',
      'pcv1_date',
      'opv_2',
      'opv_2_date',
      'pentavalent_2_dpt2',
      'pentavalent_2_dpt2_date',
      'rotavirus2',
      'rotavirus2_date',
      'opv_3',
      'opv_3_date',
      'pentavalent_3_dpt3',
      'pentavalent_3_dpt3_date',
      'ipv2',
      'ipv2_date',
      'rotavirus3',
      'rotavirus3_date',
      'pcv2',
      'pcv2_date',
      'mmr_1_mr1',
      'mmr_1_mr1_date',
      'pcv_booster',
      'pcv_booster_date',
      'vitamin_a',
      'vitamin_a_date',
      'opv_booster',
      'opv_booster_date',
      'mmr2_mr2',
      'mmr2_mr2_date',
      'dpt_booster1',
      'dpt_booster1_date',
    ];

    for (const formCode of ['INFANT_VISIT', 'INC_VISIT', 'CCV_VISIT']) {
      describe(formCode, () => {
        const allowlist = getEditableFieldCodes(formCode);

        it('includes every vaccination status/date fieldCode', () => {
          expect(allowlist).toEqual(expect.arrayContaining(vaccinationFieldCodes));
        });

        it('includes Source of immunisation data (source_of_immunization_data_collected)', () => {
          expect(allowlist).toContain('source_of_immunization_data_collected');
        });
      });
    }

    it('INC_VISIT and CCV_VISIT share the exact same allowlist as INFANT_VISIT', () => {
      expect(getEditableFieldCodes('INC_VISIT')).toEqual(getEditableFieldCodes('INFANT_VISIT'));
      expect(getEditableFieldCodes('CCV_VISIT')).toEqual(getEditableFieldCodes('INFANT_VISIT'));
    });
  });

  describe('forms not listed in SRS J.4 — always an empty allowlist', () => {
    it('ANC_VISIT has an empty allowlist (SRS J.4: "None")', () => {
      expect(getEditableFieldCodes('ANC_VISIT')).toEqual([]);
    });

    it('a referral-linked form code has an empty allowlist (SRS J.4: "None")', () => {
      expect(getEditableFieldCodes('REFERRAL_VISIT')).toEqual([]);
      expect(getEditableFieldCodes('REFERRAL_FOLLOWUP_VISIT')).toEqual([]);
    });

    it('an unrecognized form code falls back to an empty allowlist', () => {
      expect(getEditableFieldCodes('SOME_UNKNOWN_FORM_CODE')).toEqual([]);
    });
  });

  it('every allowlisted form code is a real key in FORM_ANSWER_EDIT_ALLOWLIST', () => {
    expect(Object.keys(FORM_ANSWER_EDIT_ALLOWLIST).sort()).toEqual(
      [
        'MOTHER_REGISTRATION',
        'CHILD_REGISTRATION',
        'DELIVERY_VISIT',
        'NEONATAL_VISIT',
        'ANC_CLOSURE_VISIT',
        'CHILD_CLOSURE_VISIT',
        'INFANT_VISIT',
        'INC_VISIT',
        'CCV_VISIT',
      ].sort(),
    );
  });
});
