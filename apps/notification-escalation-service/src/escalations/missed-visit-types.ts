/**
 * Shared missed-visit EscalationType constants — used by both
 * escalation.service.ts (card typing, detail mapping) and
 * missed-visit-transfer.ts (the TRANSFER Manager-email/notification
 * payload). Kept in their own module rather than exported from
 * escalation.service.ts so neither file has to import the other.
 */

/**
 * The 11 EscalationType values that Quick Response groups under one
 * MISSED_VISIT card. POST_EDD_MISSED (build plan: "EDD+7 delivery-form
 * check") rides this exact same card/detail/CLOSE/TRANSFER machinery as
 * every other visit family — it just wasn't added here yet, so it used to
 * fall through toCardType()'s null case and never surface on the Quick
 * Response list at all despite escalation.rulesJson.ts already escalating
 * it (immediate, 1-miss, same as the HR types).
 */
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
  'POST_EDD_MISSED',
]);

/**
 * Maps each of the 11 missed-visit EscalationType values onto the visitType
 * the Missed Visit Escalation detail endpoint / TRANSFER Manager-email
 * payload returns. The 3 "_HR_MISSED" ANC/PP/NN variants collapse onto
 * their base type — that enum has no ANC-HR/PP-HR/NN-HR value, unlike INC
 * and CCV which do. POST_EDD_MISSED maps to its own VisitCodeType,
 * 'ANC_POST_EDD' — it has no HR variant to collapse.
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
  POST_EDD_MISSED: 'ANC_POST_EDD',
};
