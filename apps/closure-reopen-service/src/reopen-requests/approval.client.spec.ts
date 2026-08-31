import { ApprovalClient } from './approval.client';

describe('ApprovalClient', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let client: ApprovalClient;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new ApprovalClient();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('findByClosureId', () => {
    it("GETs approval-service via the gateway with the caller's own token", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'approval-1' } }),
      });

      const result = await client.findByClosureId('closure-1', 'Bearer test-token');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/approvals/by-source?closureId=closure-1'),
        expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
      );
      expect(result).toEqual({ id: 'approval-1' });
    });

    it('returns null on a 404 (no matching approval request)', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

      await expect(client.findByClosureId('closure-1', 'Bearer test-token')).resolves.toBeNull();
    });

    it('throws HttpError with the upstream status/message on another 4xx response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'Forbidden.' }),
      });

      await expect(client.findByClosureId('closure-1', 'Bearer test-token')).rejects.toMatchObject({
        status: 403,
        message: 'Forbidden.',
      });
    });

    it('throws a badGateway error on a 5xx response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      await expect(client.findByClosureId('closure-1', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });

    it('throws a badGateway error on a network failure', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      await expect(client.findByClosureId('closure-1', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });
  });

  describe('findByReopenRequestId', () => {
    it("GETs approval-service via the gateway with the caller's own token", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { id: 'approval-2' } }),
      });

      const result = await client.findByReopenRequestId('reopen-1', 'Bearer test-token');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/approvals/by-source?reopenRequestId=reopen-1'),
        expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
      );
      expect(result).toEqual({ id: 'approval-2' });
    });

    it('returns null on a 404 (no matching approval request)', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404, json: async () => ({}) });

      await expect(
        client.findByReopenRequestId('reopen-1', 'Bearer test-token'),
      ).resolves.toBeNull();
    });
  });
});
