import { extractSocioDemographics, syncSocioDemographics } from './socio-demographics.client';

describe('extractSocioDemographics', () => {
  it('maps every socio-demographic question_code to its beneficiary-service field', () => {
    const body = extractSocioDemographics({
      who_owns_the_phone: 'self',
      availability_of_mobile_network: 'full_network_available',
      what_is_the_highest_level_of_education_you_have_completed: '10th_pass',
      what_is_the_highest_level_of_education_your_partner_have_completed: '12th_pass',
      what_is_the_occupation_of_your_partner: 'farmer',
      which_of_the_following_best_describes_your_household_s_migration_pattern:
        'permanent_migration',
      what_is_the_income_of_the_family_per_month: '10001_15000',
      what_is_your_religion: 'hindu',
      what_is_your_category: 'obc',
      since_when_have_you_been_staying_in_this_village: '7',
      how_many_family_members_in_your_household_including_children_under_5_years_of_age: '5',
      how_many_children_under_5_years_of_age_are_in_your_household: '2',
    });

    expect(body).toEqual({
      phoneOwner: 'self',
      mobileNetworkAvailability: 'full_network_available',
      educationLevel: '10th_pass',
      partnerEducationLevel: '12th_pass',
      partnerOccupation: 'farmer',
      migrationPattern: 'permanent_migration',
      monthlyIncome: '10001_15000',
      religion: 'hindu',
      socialCategory: 'obc',
      yearsInVillage: 7,
      familyMembersCount: 5,
      childrenUnder5Count: 2,
    });
  });

  it('coerces numeric answers sent as strings to numbers', () => {
    const body = extractSocioDemographics({
      since_when_have_you_been_staying_in_this_village: '12',
    });
    expect(body).toEqual({ yearsInVillage: 12 });
  });

  it('ignores unrelated question_codes', () => {
    const body = extractSocioDemographics({
      trimester_of_preganancy: '1',
      remarks: 'a note',
      what_is_your_religion: 'muslim',
    });
    expect(body).toEqual({ religion: 'muslim' });
  });

  it('returns null when the submission answered none of these questions', () => {
    expect(extractSocioDemographics({ trimester_of_preganancy: '1' })).toBeNull();
    expect(extractSocioDemographics({})).toBeNull();
  });

  it('skips empty-string and null answers rather than sending them', () => {
    const body = extractSocioDemographics({
      what_is_your_religion: '',
      what_is_your_category: null,
      who_owns_the_phone: 'self',
    });
    expect(body).toEqual({ phoneOwner: 'self' });
  });

  it('skips a non-numeric value for a numeric field', () => {
    expect(
      extractSocioDemographics({
        how_many_children_under_5_years_of_age_are_in_your_household: 'abc',
      }),
    ).toBeNull();
  });
});

describe('syncSocioDemographics', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('PATCHes the extracted answers to beneficiary-service', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    await syncSocioDemographics('b1', { what_is_your_religion: 'hindu' }, 'Bearer test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/beneficiaries/b1/socio-demographics'),
      expect.objectContaining({
        method: 'PATCH',
        body: JSON.stringify({ religion: 'hindu' }),
      }),
    );
  });

  it('does not call beneficiary-service when there is nothing to sync', async () => {
    await syncSocioDemographics('b1', { trimester_of_preganancy: '1' }, 'Bearer test-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('swallows a non-ok response so the submission is never failed by it', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      syncSocioDemographics('b1', { what_is_your_religion: 'hindu' }, 'Bearer test-token'),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });

  it('swallows a network failure so the submission is never failed by it', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      syncSocioDemographics('b1', { what_is_your_religion: 'hindu' }, 'Bearer test-token'),
    ).resolves.toBeUndefined();
    expect(warnSpy).toHaveBeenCalled();
  });
});
