import type { VisitCodeType } from '../../../../node_modules/.prisma/client-visit-form-service';

export type CaseType = 'MOTHER' | 'CHILD';

/**
 * Maps a VisitSchedule's visitType (VisitCodeType, per schema.prisma) to the
 * beneficiary case type it belongs to, for the Visit Summary widget's
 * Mother/Child split. Typed as `Record<VisitCodeType, CaseType>` (not
 * `Record<string, ...>`) so adding a new VisitCodeType value without
 * updating this map is a compile error.
 */
export const VISIT_CODE_TO_CASE_TYPE: Record<VisitCodeType, CaseType> = {
  ANC: 'MOTHER',
  ANC_HR: 'MOTHER',
  ANC_POST_EDD: 'MOTHER',
  DELIVERY: 'MOTHER',
  PP: 'MOTHER',
  PP_HR: 'MOTHER',
  NN: 'CHILD',
  NN_HR: 'CHILD',
  INC: 'CHILD',
  INC_HR: 'CHILD',
  CCV: 'CHILD',
  CCV_HR: 'CHILD',
};

/** Resolves a visitType to its CaseType, or null if the visitType isn't recognized. */
export function resolveCaseTypeForVisitCode(visitType: string): CaseType | null {
  return (VISIT_CODE_TO_CASE_TYPE as Record<string, CaseType>)[visitType] ?? null;
}
