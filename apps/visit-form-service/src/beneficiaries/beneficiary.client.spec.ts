import { findBeneficiaryById } from './beneficiary.client';

describe('findBeneficiaryById', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the beneficiary case (id/sakhiId/projectId/lookup ids/geography) when beneficiary-service returns 200', async () => {
    const data = {
      id: 'ben-1',
      sakhiId: 'sakhi-1',
      projectId: 'project-1',
      beneficiaryTypeLookupId: 'type-1',
      caseTypeLookupId: 'case-type-1',
      pii: {
        villageId: 'village-1',
        padaId: 'pada-1',
        healthSubCentreId: 'sc-1',
        phcId: 'phc-1',
        stateId: 'state-1',
        districtId: 'district-1',
      },
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data }),
    });

    const result = await findBeneficiaryById('ben-1', 'Bearer test-token');

    expect(result).toEqual({
      id: 'ben-1',
      sakhiId: 'sakhi-1',
      projectId: 'project-1',
      beneficiaryTypeLookupId: 'type-1',
      caseTypeLookupId: 'case-type-1',
      villageId: 'village-1',
      padaId: 'pada-1',
      healthSubCentreId: 'sc-1',
      phcId: 'phc-1',
      stateId: 'state-1',
      districtId: 'district-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/beneficiaries/ben-1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('returns null on 404', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(findBeneficiaryById('missing', 'Bearer test-token')).resolves.toBeNull();
  });

  it('throws a 502 (not 404) when beneficiary-service fails for a reason other than not-found', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(findBeneficiaryById('ben-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('throws a 502 when beneficiary-service is unreachable (fetch itself rejects)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(findBeneficiaryById('ben-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });
});
