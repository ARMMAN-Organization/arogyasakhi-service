/**
 * Extracts a normalized vitals object from a FormSubmission's schemaless
 * formDataJson — the only place vitals live (FormSubmission has no typed
 * BP/weight/hemoglobin columns; see form.repository.ts's
 * findLatestVisitSubmission for the "which forms actually capture vitals"
 * question). Each visit form uses a DIFFERENT question_code for the same
 * concept (confirmed against the real seeded schemas: ANC_VISIT's
 * `blood_pressure_bp_systolic` vs POSTPARTUM_VISIT's `bp_systolic`, ANC_VISIT's
 * `haemoglobin_hb_g_dl` vs POSTPARTUM_VISIT's `haemoglobin_g_dl`, etc.) —
 * there is no single universal key list; this map is keyed by formCode so
 * each form's own question_codes normalize onto one shared response shape.
 *
 * A field with no source key for a given formCode is `null`, not omitted —
 * the response shape is the same regardless of which visit type was most
 * recent, so a caller never has to branch on formCode itself.
 */
export interface VitalsSnapshot {
  weightKg: number | null;
  systolicBp: number | null;
  diastolicBp: number | null;
  temperatureF: number | null;
  hemoglobinGDl: number | null;
  muacCm: number | null;
  respiratoryRate: number | null;
}

const EMPTY_VITALS: VitalsSnapshot = {
  weightKg: null,
  systolicBp: null,
  diastolicBp: null,
  temperatureF: null,
  hemoglobinGDl: null,
  muacCm: null,
  respiratoryRate: null,
};

/**
 * question_code lookup per vitals field, per formCode — only the fields a
 * given form's schema actually asks are present; the rest are undefined
 * (mapped to null in the output, same as a field the Sakhi left blank).
 * NEONATAL_VISIT has no BP/hemoglobin/respiratory-rate/MUAC questions (per
 * the real seeded schema) and is intentionally sparse here, not an
 * oversight.
 */
const FORM_CODE_TO_VITALS_MAPPING: Record<string, Partial<Record<keyof VitalsSnapshot, string>>> = {
  ANC_VISIT: {
    weightKg: 'current_weight_of_the_woman_in_kg',
    systolicBp: 'blood_pressure_bp_systolic',
    diastolicBp: 'blood_pressure_bp_diastolic',
    temperatureF: 'body_temperature_in_f',
    hemoglobinGDl: 'haemoglobin_hb_g_dl',
    muacCm: 'mid_upper_arm_circumference_in_cm',
  },
  POSTPARTUM_VISIT: {
    weightKg: 'current_weight_kg',
    systolicBp: 'bp_systolic',
    diastolicBp: 'bp_diastolic',
    temperatureF: 'body_temperature_f',
    hemoglobinGDl: 'haemoglobin_g_dl',
    muacCm: 'current_muac_cm',
  },
  NEONATAL_VISIT: {
    weightKg: 'current_weight_kg',
  },
  // INC_VISIT and CCV_VISIT share one seeded schema (infant-visit.json —
  // see visit-code-form-map.ts / prisma/seed.ts's own note on why).
  INC_VISIT: {
    weightKg: 'current_weight_in_kg',
    muacCm: 'muac_in_cms',
    respiratoryRate: 'child_respiratory_rate_2_12_months',
  },
  CCV_VISIT: {
    weightKg: 'current_weight_in_kg',
    muacCm: 'muac_in_cms',
    respiratoryRate: 'child_respiratory_rate_2_12_months',
  },
};

function toNumberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Projects `formDataJson` down to VitalsSnapshot per `formCode`'s own
 * question_code mapping. A formCode with no entry in
 * FORM_CODE_TO_VITALS_MAPPING (or a mapping with no key for a given field)
 * returns/leaves that field null rather than throwing — this must never
 * fail the whole `GET /beneficiaries/:id/latest-visit-vitals` request, per
 * the same "degrade to null" stance as every other cross-service resolver
 * in this codebase.
 */
export function extractVitals(
  formCode: string,
  formDataJson: Record<string, unknown>,
): VitalsSnapshot {
  const mapping = FORM_CODE_TO_VITALS_MAPPING[formCode];
  if (!mapping) return { ...EMPTY_VITALS };

  const result = { ...EMPTY_VITALS };
  for (const field of Object.keys(mapping) as (keyof VitalsSnapshot)[]) {
    const questionCode = mapping[field];
    if (questionCode) {
      result[field] = toNumberOrNull(formDataJson[questionCode]);
    }
  }
  return result;
}
