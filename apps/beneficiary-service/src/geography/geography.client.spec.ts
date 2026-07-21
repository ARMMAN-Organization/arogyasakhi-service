import { resolveHealthBlockIdFromPhc } from './geography.client';

describe('resolveHealthBlockIdFromPhc', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("resolves the PHC's parentId as the Health Block id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: { geographyUnitId: 'phc-1', parentId: 'block-1', geoType: 'PHC' },
        }),
    });

    const result = await resolveHealthBlockIdFromPhc('phc-1', 'Bearer test-token');

    expect(result).toBe('block-1');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/geography-units/phc-1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('throws 422 when the geography unit is not found (404 from auth-service)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(
      resolveHealthBlockIdFromPhc('missing-phc', 'Bearer test-token'),
    ).rejects.toMatchObject({
      status: 422,
    });
  });

  it('throws when the auth-service call fails for a reason other than not-found', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(resolveHealthBlockIdFromPhc('phc-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 404,
    });
  });

  it('throws 422 when the resolved unit is not PHC-level', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: { geographyUnitId: 'village-1', parentId: 'pada-1', geoType: 'VILLAGE' },
        }),
    });

    await expect(
      resolveHealthBlockIdFromPhc('village-1', 'Bearer test-token'),
    ).rejects.toMatchObject({
      status: 422,
    });
  });

  it('throws 422 when the PHC has no parent Health Block on record', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: { geographyUnitId: 'phc-1', parentId: null, geoType: 'PHC' },
        }),
    });

    await expect(resolveHealthBlockIdFromPhc('phc-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 422,
    });
  });
});
