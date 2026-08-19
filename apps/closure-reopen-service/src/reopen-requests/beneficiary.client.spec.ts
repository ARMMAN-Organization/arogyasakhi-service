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

  describe('closeCase', () => {
    it('PATCHes beneficiary-service via the gateway with the reasonCode', async () => {
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
    it("GETs beneficiary-service via the gateway with the caller's own token", async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: 'b1', currentStatus: 'CLOSED' } }),
      });

      const result = await client.getById('b1', 'Bearer test-token');

      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/beneficiaries/b1'),
        expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
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
});
