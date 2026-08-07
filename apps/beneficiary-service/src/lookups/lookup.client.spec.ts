import { resolveLookupValues } from './lookup.client';

/** Builds a fetch mock Response for one lookup category. */
function categoryResponse(data: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data }),
  };
}

const religionCategory = {
  categoryCode: 'RELIGION',
  values: [
    { id: 'religion-hindu', valueCode: 'HINDU', valueLabel: 'Hindu' },
    { id: 'religion-muslim', valueCode: 'MUSLIM', valueLabel: 'Muslim' },
  ],
};
const educationCategory = {
  categoryCode: 'EDUCATION_LEVEL',
  values: [{ id: 'edu-primary', valueCode: 'PRIMARY', valueLabel: 'Primary education' }],
};

describe('resolveLookupValues', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('resolves a lookupValueId to its categoryCode/valueCode/label', async () => {
    fetchMock.mockResolvedValueOnce(categoryResponse(religionCategory));

    const result = await resolveLookupValues(
      { religionLookupId: { categoryCode: 'RELIGION', lookupValueId: 'religion-hindu' } },
      'Bearer test-token',
    );

    expect(result).toEqual({
      religionLookupId: { categoryCode: 'RELIGION', valueCode: 'HINDU', label: 'Hindu' },
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/lookups/RELIGION'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('returns null for a field whose lookupValueId is null, without fetching its category', async () => {
    const result = await resolveLookupValues(
      { religionLookupId: { categoryCode: 'RELIGION', lookupValueId: null } },
      'Bearer test-token',
    );

    expect(result).toEqual({ religionLookupId: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches each distinct category exactly once, even when multiple fields share it', async () => {
    fetchMock.mockResolvedValueOnce(categoryResponse(educationCategory));

    const result = await resolveLookupValues(
      {
        educationLevelLookupId: { categoryCode: 'EDUCATION_LEVEL', lookupValueId: 'edu-primary' },
        partnerEducationLevelLookupId: {
          categoryCode: 'EDUCATION_LEVEL',
          lookupValueId: 'edu-primary',
        },
      },
      'Bearer test-token',
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.educationLevelLookupId).toEqual({
      categoryCode: 'EDUCATION_LEVEL',
      valueCode: 'PRIMARY',
      label: 'Primary education',
    });
    expect(result.partnerEducationLevelLookupId).toEqual(result.educationLevelLookupId);
  });

  it('resolves to null when the lookupValueId is not found in the category (stale/deleted value)', async () => {
    fetchMock.mockResolvedValueOnce(categoryResponse(religionCategory));

    const result = await resolveLookupValues(
      { religionLookupId: { categoryCode: 'RELIGION', lookupValueId: 'no-such-id' } },
      'Bearer test-token',
    );

    expect(result).toEqual({ religionLookupId: null });
  });

  it('resolves to null when the category itself does not exist (404)', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404 });

    const result = await resolveLookupValues(
      { religionLookupId: { categoryCode: 'RELIGION', lookupValueId: 'religion-hindu' } },
      'Bearer test-token',
    );

    expect(result).toEqual({ religionLookupId: null });
  });

  it('throws a 502 when auth-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      resolveLookupValues(
        { religionLookupId: { categoryCode: 'RELIGION', lookupValueId: 'religion-hindu' } },
        'Bearer test-token',
      ),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('throws a 502 when auth-service returns a non-404 error status', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(
      resolveLookupValues(
        { religionLookupId: { categoryCode: 'RELIGION', lookupValueId: 'religion-hindu' } },
        'Bearer test-token',
      ),
    ).rejects.toMatchObject({ status: 502 });
  });
});
