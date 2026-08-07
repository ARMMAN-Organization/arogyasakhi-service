import { createBeneficiarySchema } from './create-beneficiary.dto';

const baseCase = {
  localCaseUuid: 'local-case-uuid-1',
  projectId: '11111111-1111-1111-1111-111111111111',
  sakhiId: '33333333-3333-3333-3333-333333333333',
  registrationDate: '2026-01-01',
  beneficiaryTypeLookupId: '44444444-4444-4444-4444-444444444444',
  caseTypeLookupId: '55555555-5555-5555-5555-555555555555',
};

// All SRS FR-S-2.1 required PII fields — spread into each test's pii so the
// test isolates the one thing it's checking rather than tripping the
// now-required-field validation. fullName overridden per test as needed.
const basePii = {
  fullName: 'Jane Doe',
  phone: '9876543210',
  dateOfBirth: '1995-05-05',
  villageId: '66666666-6666-6666-6666-666666666666',
  padaId: '77777777-7777-7777-7777-777777777777',
  healthSubCentreId: '88888888-8888-8888-8888-888888888888',
  phcId: '99999999-9999-9999-9999-999999999999',
  healthBlockId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  stateId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  districtId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
  rchNumber: 'RCH-0001',
};

const consent = { status: 'GIVEN', date: '2026-01-01' };

describe('createBeneficiarySchema', () => {
  describe('sex (unified SEX lookup: FEMALE, MALE, OTHER, INTERSEX)', () => {
    it('accepts INTERSEX for pii.sex (mother/adult)', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { ...basePii, sex: 'INTERSEX' },
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(true);
    });

    it('accepts INTERSEX for childDetails.sex', () => {
      const result = createBeneficiarySchema.safeParse({
        // For a CHILD case the beneficiary IS the child, so pii.dateOfBirth
        // (the beneficiary's DOB) must equal childDetails.dateOfBirth.
        pii: { ...basePii, fullName: 'Baby Doe', dateOfBirth: '2025-12-01' },
        case: { ...baseCase, caseType: 'CHILD' },
        childDetails: { dateOfBirth: '2025-12-01', sex: 'INTERSEX' },
        consent,
      });
      expect(result.success).toBe(true);
    });

    it('rejects UNKNOWN for pii.sex (removed value, no longer valid)', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { ...basePii, sex: 'UNKNOWN' },
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(false);
    });

    it('rejects UNKNOWN for childDetails.sex', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { ...basePii, fullName: 'Baby Doe', dateOfBirth: '2025-12-01' },
        case: { ...baseCase, caseType: 'CHILD' },
        childDetails: { dateOfBirth: '2025-12-01', sex: 'UNKNOWN' },
        consent,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('required PII fields (FR-S-2.1)', () => {
    // Each removes one SRS-required field and expects rejection.
    const requiredPiiFields = [
      'fullName',
      'phone',
      'dateOfBirth',
      'villageId',
      'padaId',
      'healthSubCentreId',
      'phcId',
      'stateId',
      'districtId',
    ] as const;

    it.each(requiredPiiFields)('rejects a payload missing pii.%s', (field) => {
      const pii: Record<string, unknown> = { ...basePii };
      delete pii[field];
      const result = createBeneficiarySchema.safeParse({
        pii,
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(false);
    });

    it('accepts a payload with all required PII fields present', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { ...basePii },
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(true);
    });

    it('accepts a payload with pii.healthBlockId omitted (mobile app has no field for it; server derives it from phcId)', () => {
      const pii: Record<string, unknown> = { ...basePii };
      delete pii.healthBlockId;
      const result = createBeneficiarySchema.safeParse({
        pii,
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(true);
    });

    it('still accepts pii.healthBlockId if an older client sends it (ignored, not rejected)', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { ...basePii, healthBlockId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' },
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(true);
    });

    it('accepts a payload with pii.rchNumber omitted (form allows "not registered under RCH" / "card not available" / "status not known")', () => {
      const pii: Record<string, unknown> = { ...basePii };
      delete pii.rchNumber;
      const result = createBeneficiarySchema.safeParse({
        pii,
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('socioDemographics (optional, Registration_PW_D rows 23-34)', () => {
    it('accepts a payload with socioDemographics omitted entirely', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { ...basePii },
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(true);
    });

    it('accepts a payload with all socioDemographics fields present', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { ...basePii },
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        socioDemographics: {
          phoneOwnerLookupId: '11111111-aaaa-aaaa-aaaa-111111111111',
          mobileNetworkAvailabilityLookupId: '11111111-aaaa-aaaa-aaaa-222222222222',
          educationLevelLookupId: '11111111-aaaa-aaaa-aaaa-333333333333',
          partnerEducationLevelLookupId: '11111111-aaaa-aaaa-aaaa-444444444444',
          partnerOccupationLookupId: '11111111-aaaa-aaaa-aaaa-555555555555',
          yearsInVillage: 12,
          migrationPatternLookupId: '11111111-aaaa-aaaa-aaaa-666666666666',
          monthlyIncomeLookupId: '11111111-aaaa-aaaa-aaaa-777777777777',
          religionLookupId: '11111111-aaaa-aaaa-aaaa-888888888888',
          socialCategoryLookupId: '11111111-aaaa-aaaa-aaaa-999999999999',
          familyMembersCount: 5,
          childrenUnder5Count: 2,
        },
        consent,
      });
      expect(result.success).toBe(true);
    });

    it('rejects familyMembersCount outside the doc-specified range 2-15', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { ...basePii },
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        socioDemographics: { familyMembersCount: 20 },
        consent,
      });
      expect(result.success).toBe(false);
    });

    it('rejects an unknown key inside socioDemographics (.strict())', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { ...basePii },
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        socioDemographics: { unexpectedField: 'nope' },
        consent,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('case.sakhiId (accepted but ignored — see BeneficiaryService.create)', () => {
    it('accepts a payload with case.sakhiId omitted entirely', () => {
      const caseWithoutSakhiId: Record<string, unknown> = { ...baseCase };
      delete caseWithoutSakhiId.sakhiId;
      const result = createBeneficiarySchema.safeParse({
        pii: { ...basePii },
        case: { ...caseWithoutSakhiId, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(true);
    });

    it('accepts a payload with case.sakhiId present (legacy client)', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { ...basePii },
        case: { ...baseCase, caseType: 'MOTHER' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(true);
    });

    it('rejects case.sakhiId that is not a valid uuid', () => {
      const result = createBeneficiarySchema.safeParse({
        pii: { ...basePii },
        case: { ...baseCase, caseType: 'MOTHER', sakhiId: 'not-a-uuid' },
        motherDetails: { lmpDate: '2025-10-01' },
        consent,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('pii.fullName', () => {
    it('rejects a payload missing pii.fullName', () => {
      const missingFullName: Record<string, unknown> = { ...basePii };
      delete missingFullName.fullName;
      expect(
        createBeneficiarySchema.safeParse({
          pii: missingFullName,
          case: { ...baseCase, caseType: 'MOTHER' },
          motherDetails: { lmpDate: '2025-10-01' },
          consent,
        }).success,
      ).toBe(false);
    });

    it('rejects an empty pii.fullName', () => {
      expect(
        createBeneficiarySchema.safeParse({
          pii: { ...basePii, fullName: '' },
          case: { ...baseCase, caseType: 'MOTHER' },
          motherDetails: { lmpDate: '2025-10-01' },
          consent,
        }).success,
      ).toBe(false);
    });

    it('accepts a single combined pii.fullName', () => {
      expect(
        createBeneficiarySchema.safeParse({
          pii: { ...basePii, fullName: 'Jane Q Doe' },
          case: { ...baseCase, caseType: 'MOTHER' },
          motherDetails: { lmpDate: '2025-10-01' },
          consent,
        }).success,
      ).toBe(true);
    });
  });

  it('rejects a MOTHER case missing motherDetails (M3)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii },
      case: { ...baseCase, caseType: 'MOTHER' },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a MOTHER case that also supplies childDetails (M4)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii },
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
      pii: { ...basePii },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: { lmpDate: future.toISOString() },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('rejects abortions greater than gravida (M11)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: { lmpDate: '2025-10-01', gravida: 1, abortions: 2 },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('rejects liveBirths + stillbirths + abortions != gravida (M12)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii },
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
      pii: { ...basePii },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: {
        lmpDate: '2025-10-01',
        gravida: 3,
        liveBirths: 1,
        stillbirths: 0,
        abortions: 1,
      },
      consent,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a first-time pregnancy (Gravida = 1) with no prior outcomes (M14)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: {
        lmpDate: '2025-10-01',
        gravida: 1,
        liveBirths: 0,
        stillbirths: 0,
        abortions: 0,
      },
      consent,
    });
    expect(result.success).toBe(true);
  });

  it('rejects Gravida = 0 — a currently pregnant woman is Gravida >= 1 by definition (M15)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: {
        lmpDate: '2025-10-01',
        gravida: 0,
        liveBirths: 0,
        stillbirths: 0,
        abortions: 0,
      },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('rejects parity != liveBirths + stillbirths (M16)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: {
        lmpDate: '2025-10-01',
        gravida: 3,
        parity: 2,
        liveBirths: 1,
        stillbirths: 0,
        abortions: 1,
      },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('accepts parity == liveBirths + stillbirths (M17)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: {
        lmpDate: '2025-10-01',
        gravida: 2,
        parity: 1,
        liveBirths: 0,
        stillbirths: 1,
        abortions: 0,
      },
      consent,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a valid mother enrollment (M1)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: { lmpDate: '2025-10-01', heightCm: 160, weightKg: 60 },
      consent,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a CHILD case missing childDetails (CH3)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii, fullName: 'Baby Doe' },
      case: { ...baseCase, caseType: 'CHILD' },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a child DOB more than 12 months old (CH4)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii, fullName: 'Baby Doe', dateOfBirth: '2020-01-01' },
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
      pii: { ...basePii, fullName: 'Baby Doe', dateOfBirth: future.toISOString() },
      case: { ...baseCase, caseType: 'CHILD' },
      childDetails: { dateOfBirth: future.toISOString() },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid independent child enrollment (CH1)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii, fullName: 'Baby Doe', dateOfBirth: '2025-12-01' },
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
      pii: { ...basePii, fullName: 'Baby Doe', dateOfBirth: dob.toISOString() },
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
      pii: { ...basePii, fullName: 'Baby Doe', dateOfBirth: dob.toISOString() },
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

  it('rejects a CHILD case where pii.dateOfBirth and childDetails.dateOfBirth differ (CH9)', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii, fullName: 'Baby Doe', dateOfBirth: '2025-11-01' },
      case: { ...baseCase, caseType: 'CHILD' },
      childDetails: { dateOfBirth: '2025-12-01' },
      consent,
    });
    expect(result.success).toBe(false);
  });

  it('accepts an independent child within 365 days but past 183 (CH8)', () => {
    const dob = new Date();
    dob.setDate(dob.getDate() - 200);
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii, fullName: 'Baby Doe', dateOfBirth: dob.toISOString() },
      case: { ...baseCase, caseType: 'CHILD' },
      childDetails: { dateOfBirth: dob.toISOString() },
      consent,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown top-level field (.strict())', () => {
    const result = createBeneficiarySchema.safeParse({
      pii: { ...basePii },
      case: { ...baseCase, caseType: 'MOTHER' },
      motherDetails: { lmpDate: '2025-10-01' },
      consent,
      unexpectedField: 'nope',
    });
    expect(result.success).toBe(false);
  });
});
