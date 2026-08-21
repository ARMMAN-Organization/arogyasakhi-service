/**
 * Shared missed-visit EscalationType constants — used by both
 * escalation.service.ts (card typing, detail mapping) and
 * missed-visit-transfer.ts (the TRANSFER Manager-email/notification
 * payload). Kept in their own module rather than exported from
 * escalation.service.ts so neither file has to import the other.
 */

/** The 10 EscalationType values that Quick Response groups under one MISSED_VISIT card. */
export const MISSED_VISIT_TYPES = new Set([
  'ANC_2_MISSED',
  'ANC_HR_MISSED',
  'PP_MISSED',
  'PP_HR_MISSED',
  'NN_MISSED',
  'NN_HR_MISSED',
  'INC_2_MISSED',
  'INC_HR_MISSED',
  'CCV_MISSED',
  'CCV_HR_MISSED',
]);

/**
 * Maps each of the 10 missed-visit EscalationType values onto the 7-value
 * visitType the Missed Visit Escalation detail endpoint returns. The 3
 * "_HR_MISSED" ANC/PP/NN variants collapse onto their base type — that enum
 * has no ANC-HR/PP-HR/NN-HR value, unlike INC and CCV which do.
 */
export const MISSED_VISIT_TYPE_MAP: Record<string, string> = {
  ANC_2_MISSED: 'ANC',
  ANC_HR_MISSED: 'ANC',
  PP_MISSED: 'PP',
  PP_HR_MISSED: 'PP',
  NN_MISSED: 'NN',
  NN_HR_MISSED: 'NN',
  INC_2_MISSED: 'INC',
  INC_HR_MISSED: 'INC-HR',
  CCV_MISSED: 'CCV',
  CCV_HR_MISSED: 'CCV-HR',
};
