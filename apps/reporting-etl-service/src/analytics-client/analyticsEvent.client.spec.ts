import { AnalyticsEventClient } from './analyticsEvent.client';

function pageResponse(items: unknown[], nextCursor: string | null) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data: { items, nextCursor } }),
  };
}

describe('AnalyticsEventClient', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let client: AnalyticsEventClient;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new AnalyticsEventClient();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('listPage', () => {
    it('requests the given featureArea/since/until and forwards the Authorization header', async () => {
      fetchMock.mockResolvedValue(pageResponse([], null));
      const since = new Date('2026-09-07T00:00:00.000Z');
      const until = new Date('2026-09-08T00:00:00.000Z');

      await client.listPage('ENROLLMENT', since, until, undefined, 'Bearer token');

      const [url, options] = fetchMock.mock.calls[0];
      expect(String(url)).toContain('/analytics/events');
      expect(String(url)).toContain('featureArea=ENROLLMENT');
      expect(String(url)).toContain('since=2026-09-07T00%3A00%3A00.000Z');
      expect(options).toEqual({ headers: { Authorization: 'Bearer token' } });
    });

    it('includes the cursor param only when supplied', async () => {
      fetchMock.mockResolvedValue(pageResponse([], null));

      await client.listPage('ENROLLMENT', new Date(), new Date(), 'opaque-cursor', 'Bearer token');

      expect(String(fetchMock.mock.calls[0][0])).toContain('cursor=opaque-cursor');
    });

    it('throws 502 when audit-service is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(
        client.listPage('ENROLLMENT', new Date(), new Date(), undefined, 'Bearer token'),
      ).rejects.toMatchObject({ status: 502 });
    });

    it('throws the upstream status for a 4xx response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'Caller role not permitted.' }),
      });

      await expect(
        client.listPage('ENROLLMENT', new Date(), new Date(), undefined, 'Bearer token'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('throws 502 (not the raw 5xx) when audit-service returns a server error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });

      await expect(
        client.listPage('ENROLLMENT', new Date(), new Date(), undefined, 'Bearer token'),
      ).rejects.toMatchObject({ status: 502 });
    });
  });

  describe('listAll', () => {
    it('follows nextCursor across multiple pages until exhausted', async () => {
      fetchMock
        .mockResolvedValueOnce(pageResponse([{ id: '1' }], 'cursor-1'))
        .mockResolvedValueOnce(pageResponse([{ id: '2' }], 'cursor-2'))
        .mockResolvedValueOnce(pageResponse([{ id: '3' }], null));

      const result = await client.listAll('ENROLLMENT', new Date(), new Date(), 'Bearer token');

      expect(result).toEqual([{ id: '1' }, { id: '2' }, { id: '3' }]);
      expect(fetchMock).toHaveBeenCalledTimes(3);
    });

    it('returns an empty array when the first page has no items and no cursor', async () => {
      fetchMock.mockResolvedValue(pageResponse([], null));

      const result = await client.listAll('ENROLLMENT', new Date(), new Date(), 'Bearer token');

      expect(result).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
