import { ClosureClient } from './closure.client';
import { DOWNSTREAM_DECIDE_TIMEOUT_MS, DOWNSTREAM_FETCH_TIMEOUT_MS } from './fetch-timeout';

function jsonResponse(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) };
}

describe('ClosureClient', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let client: ClosureClient;
  let timeoutSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    timeoutSpy = jest.spyOn(AbortSignal, 'timeout');
    client = new ClosureClient();
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
          data: { id: 'cl-1', beneficiaryId: 'ben-1', supervisorStatus: 'REJECTED' },
        }),
      );

      await client.decide('cl-1', 'REJECTED', 'notes', 'Bearer token');

      expect(timeoutSpy).toHaveBeenCalledWith(DOWNSTREAM_DECIDE_TIMEOUT_MS);
      expect(timeoutSpy).not.toHaveBeenCalledWith(DOWNSTREAM_FETCH_TIMEOUT_MS);
    });

    it('returns the decided record on success', async () => {
      const record = { id: 'cl-1', beneficiaryId: 'ben-1', supervisorStatus: 'REJECTED' as const };
      fetchMock.mockResolvedValue(jsonResponse(200, { data: record }));

      const result = await client.decide('cl-1', 'REJECTED', 'notes', 'Bearer token');

      expect(result).toEqual(record);
    });

    it('throws badGateway when the downstream call times out', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation was aborted.', 'TimeoutError'));

      await expect(
        client.decide('cl-1', 'APPROVED', undefined, 'Bearer token'),
      ).rejects.toMatchObject({
        status: 502,
      });
    });

    it('surfaces a downstream 409 (already decided) as the same client error, not a 502', async () => {
      fetchMock.mockResolvedValue(jsonResponse(409, { message: 'Already decided' }));

      await expect(
        client.decide('cl-1', 'APPROVED', undefined, 'Bearer token'),
      ).rejects.toMatchObject({
        status: 409,
        message: 'Already decided',
      });
    });
  });

  describe('other methods keep the shorter read timeout', () => {
    it('getById uses DOWNSTREAM_FETCH_TIMEOUT_MS', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: null }));

      await client.getById('cl-1', 'Bearer token');

      expect(timeoutSpy).toHaveBeenCalledWith(DOWNSTREAM_FETCH_TIMEOUT_MS);
      expect(timeoutSpy).not.toHaveBeenCalledWith(DOWNSTREAM_DECIDE_TIMEOUT_MS);
    });

    it('getManyByIds uses DOWNSTREAM_FETCH_TIMEOUT_MS', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

      await client.getManyByIds(['cl-1'], 'Bearer token');

      expect(timeoutSpy).toHaveBeenCalledWith(DOWNSTREAM_FETCH_TIMEOUT_MS);
      expect(timeoutSpy).not.toHaveBeenCalledWith(DOWNSTREAM_DECIDE_TIMEOUT_MS);
    });

    it('getDecisionStatusByIds uses DOWNSTREAM_FETCH_TIMEOUT_MS', async () => {
      fetchMock.mockResolvedValue(jsonResponse(200, { data: [] }));

      await client.getDecisionStatusByIds(['cl-1'], 'Bearer token');

      expect(timeoutSpy).toHaveBeenCalledWith(DOWNSTREAM_FETCH_TIMEOUT_MS);
      expect(timeoutSpy).not.toHaveBeenCalledWith(DOWNSTREAM_DECIDE_TIMEOUT_MS);
    });
  });
});
