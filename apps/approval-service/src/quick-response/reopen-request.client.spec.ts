import { ReopenRequestClient } from './reopen-request.client';
import { DOWNSTREAM_DECIDE_TIMEOUT_MS, DOWNSTREAM_FETCH_TIMEOUT_MS } from './fetch-timeout';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

describe('ReopenRequestClient', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let client: ReopenRequestClient;
  let timeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    client = new ReopenRequestClient();
  });

  afterEach(() => {
    timeoutSpy.mockRestore();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('decide', () => {
    it('bounds the request with DOWNSTREAM_DECIDE_TIMEOUT_MS, not the shorter read timeout', async () => {
      fetchMock.mockResolvedValue(
        jsonResponse(200, {
          data: { id: 'rr-1', beneficiaryId: 'ben-1', supervisorStatus: 'APPROVED' },
        }),
      );

      await client.decide('rr-1', 'APPROVED', undefined, undefined, 'Bearer token');

      expect(timeoutSpy).toHaveBeenCalledWith(DOWNSTREAM_DECIDE_TIMEOUT_MS);
      expect(timeoutSpy).not.toHaveBeenCalledWith(DOWNSTREAM_FETCH_TIMEOUT_MS);
    });

    it('returns the decided record on success', async () => {
      const record = { id: 'rr-1', beneficiaryId: 'ben-1', supervisorStatus: 'APPROVED' as const };
      fetchMock.mockResolvedValue(jsonResponse(200, { data: record }));

      const result = await client.decide('rr-1', 'APPROVED', undefined, 'notes', 'Bearer token');

      expect(result).toEqual(record);
    });

    it('throws badGateway when the downstream call times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError'));

      await expect(
        client.decide('rr-1', 'APPROVED', undefined, undefined, 'Bearer token'),
      ).rejects.toMatchObject({ status: 502 });
    });

    it('surfaces a downstream 409 (already decided) as the same client error, not a 502', async () => {
      fetchMock.mockResolvedValue(jsonResponse(409, { message: 'Already decided' }));

      await expect(
        client.decide('rr-1', 'APPROVED', undefined, undefined, 'Bearer token'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Already decided',
      });
    });
  });

  describe('other methods keep the shorter read timeout', () => {
    it('getById uses DOWNSTREAM_FETCH_TIMEOUT_MS', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: null }));

      await client.getById('rr-1', 'Bearer token');

      expect(timeoutSpy).toHaveBeenCalledWith(DOWNSTREAM_FETCH_TIMEOUT_MS);
      expect(timeoutSpy).not.toHaveBeenCalledWith(DOWNSTREAM_DECIDE_TIMEOUT_MS);
    });

    it('getManyByIds uses DOWNSTREAM_FETCH_TIMEOUT_MS', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

      await client.getManyByIds(['rr-1'], 'Bearer token');

      expect(timeoutSpy).toHaveBeenCalledWith(DOWNSTREAM_FETCH_TIMEOUT_MS);
      expect(timeoutSpy).not.toHaveBeenCalledWith(DOWNSTREAM_DECIDE_TIMEOUT_MS);
    });

    it('getDecisionStatusByIds uses DOWNSTREAM_FETCH_TIMEOUT_MS', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

      await client.getDecisionStatusByIds(['rr-1'], 'Bearer token');

      expect(timeoutSpy).toHaveBeenCalledWith(DOWNSTREAM_FETCH_TIMEOUT_MS);
      expect(timeoutSpy).not.toHaveBeenCalledWith(DOWNSTREAM_DECIDE_TIMEOUT_MS);
    });
  });
});
