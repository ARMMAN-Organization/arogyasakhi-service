import { LookupClient } from './lookup.client';

describe('LookupClient', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let client: LookupClient;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new LookupClient();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('resolveApprovalStatusId', () => {
    it('resolves a known valueCode to its id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { categoryCode: 'APPROVAL_STATUS', values: [{ id: 'id-1', valueCode: 'PENDING' }] },
        }),
      });

      await expect(client.resolveApprovalStatusId('PENDING', 'Bearer test-token')).resolves.toBe(
        'id-1',
      );
    });

    it('returns null for an unknown valueCode', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { categoryCode: 'APPROVAL_STATUS', values: [] } }),
      });

      await expect(
        client.resolveApprovalStatusId('NOT_A_CODE', 'Bearer test-token'),
      ).resolves.toBeNull();
    });

    it('returns null on a 404 response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });
      await expect(
        client.resolveApprovalStatusId('PENDING', 'Bearer test-token'),
      ).resolves.toBeNull();
    });

    it('throws a badGateway error on a network failure', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      await expect(
        client.resolveApprovalStatusId('PENDING', 'Bearer test-token'),
      ).rejects.toMatchObject({ status: 502 });
    });
  });

  describe('resolveClosureReasonCode', () => {
    it('resolves a known lookup_value_id to its valueCode', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            categoryCode: 'CLOSURE_REASON',
            values: [{ id: 'reason-1', valueCode: 'MIGRATION' }],
          },
        }),
      });

      await expect(client.resolveClosureReasonCode('reason-1', 'Bearer test-token')).resolves.toBe(
        'MIGRATION',
      );
    });

    it('returns null for an unknown lookup_value_id', async () => {
      fetchMock.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { categoryCode: 'CLOSURE_REASON', values: [] } }),
      });

      await expect(
        client.resolveClosureReasonCode('unknown-id', 'Bearer test-token'),
      ).resolves.toBeNull();
    });

    it('throws HttpError with the upstream status/message on a 4xx response', async () => {
      fetchMock.mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: 'Authentication required.' }),
      });

      await expect(
        client.resolveClosureReasonCode('reason-1', 'Bearer test-token'),
      ).rejects.toMatchObject({ status: 401 });
    });

    it('throws a badGateway error on a 5xx response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
      await expect(
        client.resolveClosureReasonCode('reason-1', 'Bearer test-token'),
      ).rejects.toMatchObject({ status: 502 });
    });

    it('throws a badGateway error on a network failure', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));
      await expect(
        client.resolveClosureReasonCode('reason-1', 'Bearer test-token'),
      ).rejects.toMatchObject({ status: 502 });
    });
  });
});
