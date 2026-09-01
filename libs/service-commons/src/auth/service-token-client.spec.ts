import { ServiceTokenClient } from './service-token-client';

describe('ServiceTokenClient', () => {
  const originalFetch = global.fetch;
  const originalEnv = process.env.API_GATEWAY_BASE_URL;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    process.env.API_GATEWAY_BASE_URL = originalEnv;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('throws immediately at construction when API_GATEWAY_BASE_URL is malformed', () => {
    process.env.API_GATEWAY_BASE_URL = 'not-a-url';
    jest.resetModules();
    const { ServiceTokenClient: FreshServiceTokenClient } = require('./service-token-client');

    expect(() => new FreshServiceTokenClient('client-id', 'client-secret')).toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('mints and caches a token', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { accessToken: 'token-1', expiresIn: 3600, roles: ['SYSTEM'] } }),
    });
    const client = new ServiceTokenClient('client-id', 'client-secret');

    const token = await client.getToken();
    const token2 = await client.getToken();

    expect(token).toBe('token-1');
    expect(token2).toBe('token-1');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('re-mints once the cached token is within the refresh margin', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { accessToken: 'token-1', expiresIn: 10, roles: ['SYSTEM'] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: { accessToken: 'token-2', expiresIn: 3600, roles: ['SYSTEM'] },
        }),
      });
    const client = new ServiceTokenClient('client-id', 'client-secret');

    const token = await client.getToken();
    const token2 = await client.getToken();

    expect(token).toBe('token-1');
    expect(token2).toBe('token-2');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('throws a 502 when auth-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));
    const client = new ServiceTokenClient('client-id', 'client-secret');

    await expect(client.getToken()).rejects.toMatchObject({ status: 502 });
  });
});
