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
});
