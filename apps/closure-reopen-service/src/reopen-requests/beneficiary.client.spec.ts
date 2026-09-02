import { BeneficiaryClient } from './beneficiary.client';

describe('BeneficiaryClient', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let client: BeneficiaryClient;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new BeneficiaryClient();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('reactivateCase', () => {
    it('PATCHes beneficiary-service via the gateway with a bounded timeout signal', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 'b1', currentStatus: 'ACTIVE' } }),
      });

      const result = await client.reactivateCase('b1', 'Bearer test-token');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/beneficiaries/b1/reactivate'),
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
          signal: expect.any(AbortSignal),
        }),
      );
      expect(result).toEqual({ id: 'b1', currentStatus: 'ACTIVE' });
    });

    it('throws HttpError with the upstream status/message on a 4xx response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'This beneficiary case is outside your own roster.' }),
      });

      await expect(client.reactivateCase('b1', 'Bearer test-token')).rejects.toMatchObject({
        status: 403,
        message: 'This beneficiary case is outside your own roster.',
      });
    });

    it('throws a badGateway error on a 5xx response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      await expect(client.reactivateCase('b1', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });

    it('throws a badGateway error on a network failure', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      await expect(client.reactivateCase('b1', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });

    it('throws a badGateway error when the request is aborted for exceeding the timeout', async () => {
      fetchMock.mockRejectedValue(new DOMException('signal timed out', 'TimeoutError'));

      await expect(client.reactivateCase('b1', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });
  });

  describe('closeCase', () => {
    it('PATCHes beneficiary-service via the gateway with the reasonCode and a bounded timeout signal', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 'b1', currentStatus: 'CLOSED' } }),
      });

      const result = await client.closeCase('b1', 'MEDICAL', 'Bearer test-token');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/beneficiaries/b1/close'),
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
          body: JSON.stringify({ reasonCode: 'MEDICAL' }),
          signal: expect.any(AbortSignal),
        }),
      );
      expect(result).toEqual({ id: 'b1', currentStatus: 'CLOSED' });
    });

    it('throws HttpError with the upstream status/message on a 4xx response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'This beneficiary case is outside your own roster.' }),
      });

      await expect(client.closeCase('b1', 'MEDICAL', 'Bearer test-token')).rejects.toMatchObject({
        status: 403,
        message: 'This beneficiary case is outside your own roster.',
      });
    });

    it('throws a badGateway error on a 5xx response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      await expect(client.closeCase('b1', 'MEDICAL', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });

    it('throws a badGateway error on a network failure', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      await expect(client.closeCase('b1', 'MEDICAL', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });
  });

  describe('getById', () => {
    it("GETs beneficiary-service via the gateway with the caller's own token and a bounded timeout signal", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 'b1', currentStatus: 'CLOSED' } }),
      });

      const result = await client.getById('b1', 'Bearer test-token');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/beneficiaries/b1'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
          signal: expect.any(AbortSignal),
        }),
      );
      expect(result).toEqual({ id: 'b1', currentStatus: 'CLOSED' });
    });

    it('throws HttpError with the upstream status/message on a 4xx response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Beneficiary case not found.' }),
      });

      await expect(client.getById('b1', 'Bearer test-token')).rejects.toMatchObject({
        status: 404,
        message: 'Beneficiary case not found.',
      });
    });

    it('throws a badGateway error on a 5xx response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      await expect(client.getById('b1', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });

    it('throws a badGateway error on a network failure', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      await expect(client.getById('b1', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });
  });

  describe('getOwnership', () => {
    it('GETs /beneficiaries/:id/ownership (not the full /beneficiaries/:id) with a bounded timeout signal', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 'b1', sakhiId: 's1', caseType: 'MOTHER' } }),
      });

      const result = await client.getOwnership('b1', 'Bearer test-token');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/beneficiaries/b1/ownership'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
          signal: expect.any(AbortSignal),
        }),
      );
      expect(fetchMock.mock.calls[0][0]).not.toMatch(/\/beneficiaries\/b1$/);
      expect(result).toEqual({ id: 'b1', sakhiId: 's1', caseType: 'MOTHER' });
    });

    it('throws HttpError with the upstream status/message on a 403 (outside roster)', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: 'This beneficiary case is outside your own roster.' }),
      });

      await expect(client.getOwnership('b1', 'Bearer test-token')).rejects.toMatchObject({
        status: 403,
        message: 'This beneficiary case is outside your own roster.',
      });
    });

    it('throws HttpError with the upstream status/message on a 404 (not found)', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ message: 'Beneficiary case not found.' }),
      });

      await expect(client.getOwnership('b1', 'Bearer test-token')).rejects.toMatchObject({
        status: 404,
        message: 'Beneficiary case not found.',
      });
    });

    it('throws a badGateway error on a 5xx response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });

      await expect(client.getOwnership('b1', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });

    it('throws a badGateway error on a network failure', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      await expect(client.getOwnership('b1', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });
  });
});
