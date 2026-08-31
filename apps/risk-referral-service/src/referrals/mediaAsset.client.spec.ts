import { mediaAssetExists } from './mediaAsset.client';

const AUTH_HEADER = 'Bearer test-token';

describe('mediaAssetExists', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns true when the media asset is viewable (200)', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });

    const result = await mediaAssetExists('11111111-1111-1111-1111-111111111111', AUTH_HEADER);

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/media/11111111-1111-1111-1111-111111111111'),
      { headers: { Authorization: AUTH_HEADER } },
    );
  });

  it('returns false when the media asset does not exist (404)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    const result = await mediaAssetExists('22222222-2222-2222-2222-222222222222', AUTH_HEADER);

    expect(result).toBe(false);
  });

  it('returns false when the caller cannot view this asset (403 — not their own)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 403 });

    const result = await mediaAssetExists('33333333-3333-3333-3333-333333333333', AUTH_HEADER);

    expect(result).toBe(false);
  });

  it('throws badGateway when media-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(
      mediaAssetExists('44444444-4444-4444-4444-444444444444', AUTH_HEADER),
    ).rejects.toMatchObject({ status: 502 });
  });

  it('throws badGateway on a 5xx from media-service', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(
      mediaAssetExists('55555555-5555-5555-5555-555555555555', AUTH_HEADER),
    ).rejects.toMatchObject({ status: 502 });
  });
});
