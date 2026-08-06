import { findSakhiById } from './sakhi.client';

describe('findSakhiById', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the Sakhi when auth-service returns 200', async () => {
    const sakhi = { sakhiId: 'sakhi-1', supervisorId: 'sup-1', primaryProjectId: 'proj-1' };
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true, data: sakhi }),
    });

    const result = await findSakhiById('sakhi-1', 'Bearer test-token');

    expect(result).toEqual(sakhi);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/sakhis/sakhi-1'),
      expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
    );
  });

  it('returns null on 404', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    await expect(findSakhiById('missing', 'Bearer test-token')).resolves.toBeNull();
  });

  it('throws a 502 when auth-service fails for a reason other than not-found', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(findSakhiById('sakhi-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('throws a 502 when auth-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(findSakhiById('sakhi-1', 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });
});
