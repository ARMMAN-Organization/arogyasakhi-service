import { randomBytes } from 'node:crypto';
import { encryptPii } from '@armman/service-commons';
import { withDecryptedName } from './beneficiary.mapper';

describe('withDecryptedName', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString('base64');
    process.env.PII_SEARCH_HASH_KEY = randomBytes(32).toString('base64');
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  function basePii(overrides: Record<string, unknown> = {}) {
    return {
      id: 'pii-1',
      fullNameEnc: encryptPii('Jane Doe'),
      phoneEnc: null,
      addressLineEnc: null,
      villageId: null,
      padaId: null,
      healthSubCentreId: null,
      phcId: null,
      healthBlockId: null,
      dateOfBirth: null,
      sex: null,
      stateId: null,
      districtId: null,
      talukaId: null,
      ...overrides,
    };
  }

  it('decrypts address and mobile number from pii', () => {
    const result = withDecryptedName({
      id: 'x',
      pii: basePii({
        phoneEnc: encryptPii('9876543210'),
        addressLineEnc: encryptPii('12 Main Street'),
      }),
    } as never);

    expect(result.pii).toMatchObject({
      mobileNumber: '9876543210',
      address: '12 Main Street',
    });
  });

  it('leaves address and mobile number null without attempting to decrypt', () => {
    const result = withDecryptedName({
      id: 'x',
      pii: basePii({ phoneEnc: null, addressLineEnc: null }),
    } as never);

    expect(result.pii).toMatchObject({ mobileNumber: null, address: null });
  });

  it('decrypts rchNumber from pii', () => {
    const result = withDecryptedName({
      id: 'x',
      pii: basePii({ rchNumberEnc: encryptPii('KA201900042') }),
    } as never);

    expect(result.pii).toMatchObject({ rchNumber: 'KA201900042' });
  });

  it('leaves rchNumber null without attempting to decrypt', () => {
    const result = withDecryptedName({
      id: 'x',
      pii: basePii({ rchNumberEnc: null }),
    } as never);

    expect(result.pii).toMatchObject({ rchNumber: null });
  });

  it('projects socioDemographics when present, allow-listing only documented fields', () => {
    const result = withDecryptedName({
      id: 'x',
      pii: basePii(),
      socioDemographics: {
        beneficiaryId: 'x',
        phoneOwnerLookupId: 'lv-1',
        mobileNetworkAvailabilityLookupId: 'lv-2',
        educationLevelLookupId: 'lv-3',
        partnerEducationLevelLookupId: 'lv-4',
        partnerOccupationLookupId: 'lv-5',
        yearsInVillage: 12,
        migrationPatternLookupId: 'lv-6',
        monthlyIncomeLookupId: 'lv-7',
        religionLookupId: 'lv-8',
        socialCategoryLookupId: 'lv-9',
        familyMembersCount: 5,
        childrenUnder5Count: 1,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
    } as never);

    expect(result.socioDemographics).toEqual({
      phoneOwnerLookupId: 'lv-1',
      mobileNetworkAvailabilityLookupId: 'lv-2',
      educationLevelLookupId: 'lv-3',
      partnerEducationLevelLookupId: 'lv-4',
      partnerOccupationLookupId: 'lv-5',
      yearsInVillage: 12,
      migrationPatternLookupId: 'lv-6',
      monthlyIncomeLookupId: 'lv-7',
      religionLookupId: 'lv-8',
      socialCategoryLookupId: 'lv-9',
      familyMembersCount: 5,
      childrenUnder5Count: 1,
    });
    expect(result.socioDemographics).not.toHaveProperty('beneficiaryId');
    expect(result.socioDemographics).not.toHaveProperty('createdAt');
  });

  it('returns null socioDemographics for a case with no row yet', () => {
    const result = withDecryptedName({
      id: 'x',
      pii: basePii(),
      socioDemographics: null,
    } as never);

    expect(result.socioDemographics).toBeNull();
  });

  it('omits socioDemographics entirely when the relation was not queried (list view)', () => {
    const result = withDecryptedName({
      id: 'x',
      pii: basePii(),
    } as never);

    expect(result).not.toHaveProperty('socioDemographics');
  });

  it('projects currentPhase and ccvOpeningRiskState on childCaseDetails', () => {
    const result = withDecryptedName({
      id: 'x',
      pii: basePii(),
      childCaseDetails: {
        motherBeneficiaryId: 'mother-1',
        dateOfBirth: new Date('2026-01-01'),
        sex: 'FEMALE',
        birthWeightKg: 3.1,
        birthLengthCm: 49,
        prematureFlag: false,
        linkedAncCase: true,
        currentPhase: 'CCV',
        ccvOpeningRiskState: 'STABLE_LOW_RISK',
      },
    } as never);

    expect(result.childCaseDetails).toMatchObject({
      currentPhase: 'CCV',
      ccvOpeningRiskState: 'STABLE_LOW_RISK',
    });
  });

  it('leaves childCaseDetails null for a mother case', () => {
    const result = withDecryptedName({
      id: 'x',
      pii: basePii(),
      childCaseDetails: null,
    } as never);

    expect(result.childCaseDetails).toBeNull();
  });

  it('projects riskConditionSummaries with null conditionCode/conditionName/gradeScale placeholders', () => {
    const result = withDecryptedName({
      id: 'x',
      pii: basePii(),
      riskConditionSummaries: [
        {
          riskConditionId: 'rc-1',
          phase: 'ANC',
          latestGrade: 'SEVERE',
          latestAssessedAt: new Date('2026-01-01'),
          everHighestGrade: 'SEVERE',
          everAtRiskFlag: true,
          currentReferralTriggerFlag: true,
          currentHrVisitTriggerFlag: false,
        },
      ],
    } as never);

    expect(result.riskConditionSummaries).toEqual([
      expect.objectContaining({
        riskConditionId: 'rc-1',
        conditionCode: null,
        conditionName: null,
        gradeScale: null,
      }),
    ]);
  });
});
