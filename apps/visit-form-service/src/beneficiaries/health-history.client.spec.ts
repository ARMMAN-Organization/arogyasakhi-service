import { extractSelfReportedConditionCodes, syncHealthHistory } from './health-history.client';

const Q58 =
  'have_you_ever_been_diagnosed_with_or_treated_for_any_of_the_following_medical_conditions';
const Q60 = 'have_you_been_detected_with_sickle_cell_disease_or_sickle_cell_trait_sct';

describe('extractSelfReportedConditionCodes', () => {
  it('maps a single Q58 positive code to its risk condition code', () => {
    expect(extractSelfReportedConditionCodes({ [Q58]: ['hypertension_high_bp'] })).toEqual([
      'HYPERTENSION_HIGH_BP',
    ]);
  });

  it('maps multiple Q58 positive codes', () => {
    expect(
      extractSelfReportedConditionCodes({
        [Q58]: ['hypertension_high_bp', 'hiv_aids', 'tuberculosis_current_or_past'],
      }),
    ).toEqual(['HYPERTENSION_HIGH_BP', 'HIV_AIDS', 'TUBERCULOSIS']);
  });

  it('excludes "no known medical condition"', () => {
    expect(extractSelfReportedConditionCodes({ [Q58]: ['no_known_medical_condition'] })).toEqual(
      [],
    );
  });

  it('excludes "don\'t know" for Q58', () => {
    expect(extractSelfReportedConditionCodes({ [Q58]: ['don_t_know'] })).toEqual([]);
  });

  it('maps Q60 "Sickle Cell Disease (SCD)"', () => {
    expect(extractSelfReportedConditionCodes({ [Q60]: 'sickle_cell_disease_scd' })).toEqual([
      'SICKLE_CELL_DISEASE',
    ]);
  });

  it('maps Q60 "Sickle Cell Trait (SCT)/Carrier"', () => {
    expect(extractSelfReportedConditionCodes({ [Q60]: 'sickle_cell_trait_sct_carrier' })).toEqual([
      'SICKLE_CELL_TRAIT',
    ]);
  });

  it.each([
    'tested_and_result_is_normal',
    'not_tested_yet',
    'don_t_know_not_aware',
    'tested_earlier_but_result_not_available',
  ])('excludes Q60 negative code %s', (code) => {
    expect(extractSelfReportedConditionCodes({ [Q60]: code })).toEqual([]);
  });

  it('combines Q58 and Q60 positives with no duplicates', () => {
    expect(
      extractSelfReportedConditionCodes({
        [Q58]: ['hypertension_high_bp', 'thyroid_disorder'],
        [Q60]: 'sickle_cell_trait_sct_carrier',
      }),
    ).toEqual(['HYPERTENSION_HIGH_BP', 'THYROID_DISORDER', 'SICKLE_CELL_TRAIT']);
  });

  it('returns an empty array when neither question was answered', () => {
    expect(extractSelfReportedConditionCodes({})).toEqual([]);
    expect(extractSelfReportedConditionCodes({ trimester_of_preganancy: '1' })).toEqual([]);
  });

  it('ignores unrelated formData keys without throwing', () => {
    expect(
      extractSelfReportedConditionCodes({ trimester_of_preganancy: '1', remarks: 'a note' }),
    ).toEqual([]);
  });
});

describe('syncHealthHistory', () => {
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

  it('makes no fetch calls when nothing was extracted', async () => {
    await syncHealthHistory('b1', {}, 'Bearer test-token');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves one condition and PATCHes a single ungraded summary row', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'rc-1', conditionCode: 'HYPERTENSION_HIGH_BP' }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await syncHealthHistory('b1', { [Q58]: ['hypertension_high_bp'] }, 'Bearer test-token');

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('/risk-conditions?conditionCode=HYPERTENSION_HIGH_BP'),
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/beneficiaries/b1/risk-condition-summary'),
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('"riskConditionId":"rc-1"'),
      }),
    );
    const secondCallBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(secondCallBody).toMatchObject({
      riskConditionId: 'rc-1',
      phase: 'REGISTRATION',
      isReferralTrigger: false,
      isHrVisitTrigger: false,
    });
    expect(secondCallBody.grade).toBeUndefined();
    expect(secondCallBody.gradeRank).toBeUndefined();
  });

  it('sends one PATCH per resolved condition for multiple positives', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'rc-1', conditionCode: 'HYPERTENSION_HIGH_BP' },
            { id: 'rc-2', conditionCode: 'SICKLE_CELL_TRAIT' },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await syncHealthHistory(
      'b1',
      { [Q58]: ['hypertension_high_bp'], [Q60]: 'sickle_cell_trait_sct_carrier' },
      'Bearer test-token',
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('skips a condition code the lookup did not resolve, without throwing', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ id: 'rc-1', conditionCode: 'HYPERTENSION_HIGH_BP' }],
        }),
      })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await syncHealthHistory(
      'b1',
      { [Q58]: ['hypertension_high_bp', 'hiv_aids'] },
      'Bearer test-token',
    );

    // Lookup returned only one of the two requested codes — only one PATCH follows.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('swallows a non-ok lookup response and makes no PATCH calls', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(
      syncHealthHistory('b1', { [Q58]: ['hypertension_high_bp'] }, 'Bearer test-token'),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('swallows a lookup network failure and makes no PATCH calls', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await expect(
      syncHealthHistory('b1', { [Q58]: ['hypertension_high_bp'] }, 'Bearer test-token'),
    ).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalled();
  });

  it('swallows a PATCH failure for one condition and still attempts the remaining ones', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: 'rc-1', conditionCode: 'HYPERTENSION_HIGH_BP' },
            { id: 'rc-2', conditionCode: 'SICKLE_CELL_TRAIT' },
          ],
        }),
      })
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: true, status: 200 });

    await syncHealthHistory(
      'b1',
      { [Q58]: ['hypertension_high_bp'], [Q60]: 'sickle_cell_trait_sct_carrier' },
      'Bearer test-token',
    );

    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(warnSpy).toHaveBeenCalled();
  });
});
