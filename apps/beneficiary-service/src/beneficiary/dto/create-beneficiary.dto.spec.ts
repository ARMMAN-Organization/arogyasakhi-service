import { createBeneficiarySchema } from './create-beneficiary.dto';

const baseCase = {
  localCaseUuid: 'local-case-uuid-1',
  projectId: '11111111-1111-1111-1111-111111111111',
  sakhiId: '33333333-3333-3333-3333-333333333333',
  registrationDate: '2026-01-01',
  beneficiaryTypeLookupId: '44444444-4444-4444-4444-444444444444',
  caseTypeLookupId: '55555555-5555-5555-5555-555555555555',
};

const consent = { status: 'GIVEN', date: '2026-01-01' };

describe('createBeneficiarySchema', () => {
  describe('sex (unified SEX lookup: FEMALE, MALE, OTHER, INTERSEX)', () => {
    it('accepts INTERSEX for pii.sex (mother/adult)', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { fullName: 'Jane Doe', sex: 'INTERSEX' },
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(true);
    });

    it('accepts INTERSEX for childDetails.sex', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { fullName: 'Baby Doe' },
        case: { ...baseCase, caseType: 'CHILD' },
        childDetails: { dateOfBirth: '2025-12-01', sex: 'INTERSEX' },
        consent,
      });
      expect(result.success).toBe(true);
    });

    it('rejects UNKNOWN for pii.sex (removed value, no longer valid)', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { fullName: 'Jane Doe', sex: 'UNKNOWN' },
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(false);
    });

    it('rejects UNKNOWN for childDetails.sex', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { fullName: 'Baby Doe' },
        case: { ...baseCase, caseType: 'CHILD' },
        childDetails: { dateOfBirth: '2025-12-01', sex: 'UNKNOWN' },
        consent,
      });
      expect(result.success).toBe(false);
    });
  });

  it('rejects a MOTHER case missing motherDetails (M3)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Jane Doe' },
      case: { ...baseCase, caseType: 'MOTHER' },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a MOTHER case that also supplies childDetails (M4)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Jane Doe' },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: { lmpDate: '2025-10-01' },
      childDetails: { dateOfBirth: '2025-12-01' },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a future lmpDate (M6)', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Jane Doe' },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: { lmpDate: future.toISOString() },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('rejects abortions greater than gravida (M11)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Jane Doe' },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: { lmpDate: '2025-10-01', gravida: 1, abortions: 2 },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('rejects liveBirths + stillbirths + abortions != gravida (M12)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Jane Doe' },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: {
        lmpDate: '2025-10-01',
        gravida: 3,
        liveBirths: 1,
        stillbirths: 0,
        abortions: 0,
      },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('accepts consistent Gravida/liveBirths/stillbirths/abortions counts (M13)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Jane Doe' },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: {
        lmpDate: '2025-10-01',
        gravida: 3,
        liveBirths: 2,
        stillbirths: 0,
        abortions: 1,
      },
      consent,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid mother enrollment (M1)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Jane Doe', phone: '9876543210' },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: { lmpDate: '2025-10-01', heightCm: 160, weightKg: 60 },
      consent,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a CHILD case missing childDetails (CH3)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Baby Doe' },
      case: { ...baseCase, caseType: 'CHILD' },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a child DOB more than 12 months old (CH4)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Baby Doe' },
      case: { ...baseCase, caseType: 'CHILD' },
      childDetails: { dateOfBirth: '2020-01-01' },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a future child DOB (CH5)', () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Baby Doe' },
      case: { ...baseCase, caseType: 'CHILD' },
      childDetails: { dateOfBirth: future.toISOString() },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid independent child enrollment (CH1)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Baby Doe' },
      case: { ...baseCase, caseType: 'CHILD' },
      childDetails: { dateOfBirth: '2025-12-01' },
      consent,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a mother-linked child within the 0-183-day window (CH6)', () => {
    const dob = new Date();
    dob.setDate(dob.getDate() - 100);
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Baby Doe' },
      case: {
        ...baseCase,
        caseType: 'CHILD',
        motherBeneficiaryId: '66666666-6666-6666-6666-666666666666',
      },
      childDetails: { dateOfBirth: dob.toISOString() },
      consent,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a mother-linked child past the 183-day window even though it is within 365 days (CH7)', () => {
    const dob = new Date();
    dob.setDate(dob.getDate() - 200);
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Baby Doe' },
      case: {
        ...baseCase,
        caseType: 'CHILD',
        motherBeneficiaryId: '66666666-6666-6666-6666-666666666666',
      },
      childDetails: { dateOfBirth: dob.toISOString() },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('accepts an independent child within 365 days but past 183 (CH8)', () => {
    const dob = new Date();
    dob.setDate(dob.getDate() - 200);
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Baby Doe' },
      case: { ...baseCase, caseType: 'CHILD' },
      childDetails: { dateOfBirth: dob.toISOString() },
      consent,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown top-level field (.strict())', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { fullName: 'Jane Doe' },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: { lmpDate: '2025-10-01' },
      consent,
      unexpectedField: 'nope',
    });
    expect(result.success).toBe(false);
  });
});
