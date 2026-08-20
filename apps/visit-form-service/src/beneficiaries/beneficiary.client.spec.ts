import { findBeneficiaryById, findBeneficiaryOwnership } from './beneficiary.client';

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
      currentPhase: 'ANC',
      pii: {
        villageId: 'village-1',
        padaId: 'pada-1',
        healthSubCentreId: 'sc-1',
        phcId: 'phc-1',
        stateId: 'state-1',
        districtId: 'district-1',
      },
      childCaseDetails: null,
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
      currentPhase: 'ANC',
      villageId: 'village-1',
      padaId: 'pada-1',
      healthSubCentreId: 'sc-1',
      phcId: 'phc-1',
      stateId: 'state-1',
      districtId: 'district-1',
      childDateOfBirth: null,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/beneficiaries/ben-1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('returns childDateOfBirth from childCaseDetails.dateOfBirth for a CHILD case', async () => {
    const data = {
      id: 'child-1',
      sakhiId: 'sakhi-1',
      projectId: 'project-1',
      beneficiaryTypeLookupId: 'type-1',
      caseTypeLookupId: 'case-type-1',
      currentPhase: 'INC',
      pii: {
        villageId: 'village-1',
        padaId: 'pada-1',
        healthSubCentreId: 'sc-1',
        phcId: 'phc-1',
        stateId: 'state-1',
        districtId: 'district-1',
      },
      childCaseDetails: { dateOfBirth: '2026-01-15T00:00:00.000Z' },
    };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data }),
    });

    const result = await findBeneficiaryById('child-1', 'Bearer test-token');

    expect(result?.childDateOfBirth).toBe('2026-01-15T00:00:00.000Z');
    expect(result?.currentPhase).toBe('INC');
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

describe('findBeneficiaryOwnership', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('calls GET /beneficiaries/:id/ownership, NOT the full GET /beneficiaries/:id', async () => {
    const data = { id: 'ben-1', sakhiId: 'sakhi-1', caseType: 'MOTHER' };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data }),
    });

    const result = await findBeneficiaryOwnership('ben-1', 'Bearer test-token');

    expect(result).toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/beneficiaries/ben-1/ownership'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('returns null on 404', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(findBeneficiaryOwnership('missing', 'Bearer test-token')).resolves.toBeNull();
  });

  it('throws a 502 when beneficiary-service returns a non-404 error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(findBeneficiaryOwnership('ben-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('forwards a 403 from the ownership endpoint as a real 403, not a 502 — beneficiary-service already ran its own SAKHI/SUPERVISOR roster check', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: () =>
        Promise.resolve({
          success: false,
          message: 'This beneficiary case is outside your own roster.',
        }),
    });

    await expect(findBeneficiaryOwnership('ben-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 403,
      message: 'This beneficiary case is outside your own roster.',
    });
  });

  it('still throws a 403 with a generic message if the 403 response body cannot be parsed', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.reject(new Error('not json')),
    });

    await expect(findBeneficiaryOwnership('ben-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 403,
    });
  });

  it('throws a 502 when beneficiary-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(findBeneficiaryOwnership('ben-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });
});
