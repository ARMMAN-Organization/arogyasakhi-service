/**
 * Maps a VisitSchedule's visitType (VisitCodeType, per schema.prisma) to the
 * formCode a client must call GET /forms/:formCode/active-version and
 * POST /forms/:formCode/submissions with.
 *
 * There is no separate form for an _HR visit type — per SRS v3.0 §"High
 * Risk Detection" (FR-S-5.2/5.3), an HR visit is a SCHEDULING concept (a
 * follow-up visit generated when a high-risk condition is detected), not a
 * distinct clinical form. An HR visit is filled using the same form as its
 * base visit type: ANC_HR -> ANC_VISIT, INC_HR -> INC_VISIT, CCV_HR ->
 * CCV_VISIT. ANC_POST_EDD likewise has no dedicated form; it uses ANC_VISIT.
 *
 * CCV_VISIT and INC_VISIT currently point at the same schema content — SRS
 * v3.0 confirms "CCV visit form uses same structure and HR thresholds as
 * INC visit form... No separate CCV-specific guidelines required" (Niharika
 * Vyas, May 2026). If ARMMAN later provides CCV-specific fields, only
 * CCV_VISIT's own form_definitions row needs a new version — this map is
 * unaffected either way, since it already routes CCV to its own formCode.
 */
export const VISIT_CODE_TO_FORM_CODE: Record<string, string> = {
  ANC: 'ANC_VISIT',
  ANC_HR: 'ANC_VISIT',
  ANC_POST_EDD: 'ANC_VISIT',
  DELIVERY: 'DELIVERY_VISIT',
  PP: 'POSTPARTUM_VISIT',
  NN: 'NEONATAL_VISIT',
  INC: 'INC_VISIT',
  INC_HR: 'INC_VISIT',
  CCV: 'CCV_VISIT',
  CCV_HR: 'CCV_VISIT',
};

/** Resolves a visitType to its formCode, or null if the visitType isn't recognized. */
export function resolveFormCodeForVisitType(visitType: string): string | null {
  return VISIT_CODE_TO_FORM_CODE[visitType] ?? null;
}
