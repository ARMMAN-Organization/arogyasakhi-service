import { VISIT_CODE_TO_CASE_TYPE, resolveCaseTypeForVisitCode } from './visit-code-case-type-map';

describe('VISIT_CODE_TO_CASE_TYPE', () => {
  it('maps every VisitCodeType value to MOTHER or CHILD', () => {
    for (const caseType of Object.values(VISIT_CODE_TO_CASE_TYPE)) {
      expect(['MOTHER', 'CHILD']).toContain(caseType);
    }
    expect(Object.keys(VISIT_CODE_TO_CASE_TYPE)).toHaveLength(12);
  });

  it.each([
    ['ANC', 'MOTHER'],
    ['ANC_HR', 'MOTHER'],
    ['ANC_POST_EDD', 'MOTHER'],
    ['DELIVERY', 'MOTHER'],
    ['PP', 'MOTHER'],
    ['PP_HR', 'MOTHER'],
    ['NN', 'CHILD'],
    ['NN_HR', 'CHILD'],
    ['INC', 'CHILD'],
    ['INC_HR', 'CHILD'],
    ['CCV', 'CHILD'],
    ['CCV_HR', 'CHILD'],
  ])('maps %s to %s', (visitType, caseType) => {
    expect(resolveCaseTypeForVisitCode(visitType)).toBe(caseType);
  });

  it('returns null for an unrecognized visitType', () => {
    expect(resolveCaseTypeForVisitCode('SOME_UNKNOWN_TYPE')).toBeNull();
  });
});
