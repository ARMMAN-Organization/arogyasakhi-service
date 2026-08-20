import { extractVisitHistoryVitals, extractVitals } from './vitalsExtractor';

describe('extractVitals', () => {
  it('extracts ANC_VISIT vitals from their own question_codes', () => {
    const result = extractVitals('ANC_VISIT', {
      current_weight_of_the_woman_in_kg: 58.5,
      blood_pressure_bp_systolic: 120,
      blood_pressure_bp_diastolic: 80,
      body_temperature_in_f: 98.6,
      haemoglobin_hb_g_dl: 11.2,
      mid_upper_arm_circumference_in_cm: 24.5,
      blood_glucose_in_mg_dl: 95,
    });

    expect(result).toEqual({
      weightKg: 58.5,
      systolicBp: 120,
      diastolicBp: 80,
      temperatureF: 98.6,
      hemoglobinGDl: 11.2,
      muacCm: 24.5,
      respiratoryRate: null,
      bloodSugarMgDl: 95,
    });
  });

  it('extracts POSTPARTUM_VISIT vitals from its own DIFFERENT question_codes for the same concepts', () => {
    const result = extractVitals('POSTPARTUM_VISIT', {
      current_weight_kg: 55,
      bp_systolic: 118,
      bp_diastolic: 76,
      body_temperature_f: 98.4,
      haemoglobin_g_dl: 12.1,
      current_muac_cm: 25,
      random_blood_glucose_mg_dl: 88,
    });

    expect(result).toEqual({
      weightKg: 55,
      systolicBp: 118,
      diastolicBp: 76,
      temperatureF: 98.4,
      hemoglobinGDl: 12.1,
      muacCm: 25,
      respiratoryRate: null,
      bloodSugarMgDl: 88,
    });
  });

  it('extracts INC_VISIT vitals (weight/MUAC/respiratory rate, no BP/hemoglobin/blood sugar)', () => {
    const result = extractVitals('INC_VISIT', {
      current_weight_in_kg: 8.2,
      muac_in_cms: 13.5,
      child_respiratory_rate_2_12_months: 32,
    });

    expect(result).toEqual({
      weightKg: 8.2,
      systolicBp: null,
      diastolicBp: null,
      temperatureF: null,
      hemoglobinGDl: null,
      muacCm: 13.5,
      respiratoryRate: 32,
      bloodSugarMgDl: null,
    });
  });

  it('extracts CCV_VISIT vitals using the same mapping as INC_VISIT (shared schema)', () => {
    const result = extractVitals('CCV_VISIT', {
      current_weight_in_kg: 10.5,
      muac_in_cms: 14.2,
      child_respiratory_rate_2_12_months: 28,
    });

    expect(result).toEqual(
      expect.objectContaining({ weightKg: 10.5, muacCm: 14.2, respiratoryRate: 28 }),
    );
  });

  it('extracts only weightKg for NEONATAL_VISIT (its schema has no BP/hemoglobin/MUAC/respiratory-rate/blood-sugar questions)', () => {
    const result = extractVitals('NEONATAL_VISIT', { current_weight_kg: 3.1 });

    expect(result).toEqual({
      weightKg: 3.1,
      systolicBp: null,
      diastolicBp: null,
      temperatureF: null,
      hemoglobinGDl: null,
      muacCm: null,
      respiratoryRate: null,
      bloodSugarMgDl: null,
    });
  });

  it('returns an all-null snapshot for a formCode with no vitals mapping (e.g. a closure visit)', () => {
    const result = extractVitals('ANC_CLOSURE_VISIT', { closure_visit_date: '2026-01-01' });

    expect(result).toEqual({
      weightKg: null,
      systolicBp: null,
      diastolicBp: null,
      temperatureF: null,
      hemoglobinGDl: null,
      muacCm: null,
      respiratoryRate: null,
      bloodSugarMgDl: null,
    });
  });

  it('leaves a field null when the source question_code is missing from formDataJson', () => {
    const result = extractVitals('ANC_VISIT', { blood_pressure_bp_systolic: 130 });

    expect(result.systolicBp).toBe(130);
    expect(result.weightKg).toBeNull();
    expect(result.hemoglobinGDl).toBeNull();
  });

  it('treats a non-numeric answer (e.g. a blank string) as null rather than throwing', () => {
    const result = extractVitals('ANC_VISIT', { blood_pressure_bp_systolic: '' });

    expect(result.systolicBp).toBeNull();
  });
});

describe('extractVisitHistoryVitals', () => {
  it('shapes an ANC_VISIT submission into unit-wrapped vitals, values as strings', () => {
    const result = extractVisitHistoryVitals('ANC_VISIT', {
      current_weight_of_the_woman_in_kg: 60.2,
      blood_pressure_bp_systolic: 120,
      blood_pressure_bp_diastolic: 80,
      body_temperature_in_f: 98.6,
      haemoglobin_hb_g_dl: 9.4,
      blood_glucose_in_mg_dl: 95,
    });

    expect(result).toEqual({
      hemoglobin: { value: '9.4', unit: 'g/dl' },
      bloodPressure: { systolic: 120, diastolic: 80, unit: 'mmHg' },
      weight: { value: '60.2', unit: 'kg' },
      bloodSugar: { value: '95', unit: 'mg/dl' },
      temperature: { value: '98.6', unit: '°F' },
    });
  });

  it('nulls a vital not captured by the visit form, unit still present (e.g. PP visit has no blood-sugar question in this payload)', () => {
    const result = extractVisitHistoryVitals('POSTPARTUM_VISIT', {
      current_weight_kg: 55,
      bp_systolic: 118,
      bp_diastolic: 76,
    });

    expect(result.bloodSugar).toEqual({ value: null, unit: 'mg/dl' });
    expect(result.hemoglobin).toEqual({ value: null, unit: 'g/dl' });
  });

  it('nulls both systolic and diastolic (but keeps the unit) for a formCode with no BP questions at all', () => {
    const result = extractVisitHistoryVitals('NEONATAL_VISIT', { current_weight_kg: 3.1 });

    expect(result.bloodPressure).toEqual({ systolic: null, diastolic: null, unit: 'mmHg' });
  });

  it('never converts temperature to Celsius — reports the stored °F value as-is', () => {
    const result = extractVisitHistoryVitals('ANC_VISIT', { body_temperature_in_f: 98.6 });

    expect(result.temperature).toEqual({ value: '98.6', unit: '°F' });
  });
});
