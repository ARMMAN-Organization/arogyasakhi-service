import { getAncestorChain } from './geography.client';

describe('getAncestorChain', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the ancestor chain ordered from the unit up to STATE', async () => {
    const chain = [
      { geographyUnitId: 'pada-1', parentId: 'village-1', geoType: 'PADA' },
      { geographyUnitId: 'village-1', parentId: 'state-1', geoType: 'VILLAGE' },
      { geographyUnitId: 'state-1', parentId: null, geoType: 'STATE' },
    ];
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: chain }),
    });

    const result = await getAncestorChain('pada-1', 'Bearer test-token');

    expect(result).toEqual(chain);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/geography-units/pada-1/ancestors'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('throws not-found when the geography unit is not found (404 from auth-service)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(getAncestorChain('missing-unit', 'Bearer test-token')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('throws when the auth-service call fails for a reason other than not-found', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(getAncestorChain('pada-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 404,
    });
  });
});
