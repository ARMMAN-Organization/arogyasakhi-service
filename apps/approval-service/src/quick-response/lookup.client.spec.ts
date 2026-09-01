jest.mock('../config/app-config', () => ({
  appConfig: { API_GATEWAY_BASE_URL: 'http://localhost:3000' },
}));

import { LookupClient } from './lookup.client';

const AUTH_HEADER = 'Bearer test-token';

describe('LookupClient', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let client: LookupClient;

  const category = {
    categoryCode: 'APPROVAL_STATUS',
    values: [
      { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', valueCode: 'PENDING' },
      { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', valueCode: 'APPROVED' },
    ],
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new LookupClient();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('fetches with an AbortSignal timeout on every call', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: category }) });

    await client.resolveApprovalStatusId('PENDING', AUTH_HEADER);

    const options = fetchMock.mock.calls[0][1] as { signal?: AbortSignal };
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('does not cache — fetches fresh on every call', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: category }) });

    await client.resolveApprovalStatusId('PENDING', AUTH_HEADER);
    await client.resolveApprovalStatusId('APPROVED', AUTH_HEADER);
    await client.resolveApprovalStatusCode('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', AUTH_HEADER);

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('resolves a valueCode to its lookup_value_id', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: category }) });

    const result = await client.resolveApprovalStatusId('APPROVED', AUTH_HEADER);

    expect(result).toBe('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
  });

  it('returns null for an unknown valueCode', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: category }) });

    const result = await client.resolveApprovalStatusId('NOT_A_STATUS', AUTH_HEADER);

    expect(result).toBeNull();
  });

  it('returns null when the category is not found (404)', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 404 });

    const result = await client.resolveApprovalStatusId('PENDING', AUTH_HEADER);

    expect(result).toBeNull();
  });

  it('throws a 502 when auth-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));

    await expect(client.resolveApprovalStatusId('PENDING', AUTH_HEADER)).rejects.toMatchObject({
      status: 502,
    });
  });

  it('resolveApprovalStatusCode fails open to null on any resolution failure', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));

    const result = await client.resolveApprovalStatusCode(
      'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      AUTH_HEADER,
    );

    expect(result).toBeNull();
  });
});
