jest.mock('../config/app-config', () => ({
  appConfig: { API_GATEWAY_BASE_URL: 'http://localhost:3000' },
}));

import { BeneficiaryClient } from './beneficiary.client';

const AUTH_HEADER = 'Bearer test-token';
const SAKHI_USER_ID = '11111111-1111-1111-1111-111111111111';

describe('BeneficiaryClient.restoreForSakhi', () => {
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

  it('PATCHes beneficiary-service with the sakhiUserId and returns the restored count', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: { restoredCaseCount: 3 } }),
    });

    const result = await client.restoreForSakhi(SAKHI_USER_ID, AUTH_HEADER);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/beneficiaries/restore',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({ Authorization: AUTH_HEADER }),
        body: JSON.stringify({ sakhiUserId: SAKHI_USER_ID }),
      }),
    );
    expect(result).toEqual({ restoredCaseCount: 3 });
  });

  it('throws a 502 when beneficiary-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network error'));

    await expect(client.restoreForSakhi(SAKHI_USER_ID, AUTH_HEADER)).rejects.toMatchObject({
      status: 502,
    });
  });

  it('throws the upstream status and message for a 4xx response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: () => Promise.resolve({ message: 'Forbidden' }),
    });

    await expect(client.restoreForSakhi(SAKHI_USER_ID, AUTH_HEADER)).rejects.toMatchObject({
      status: 403,
      message: 'Forbidden',
    });
  });

  it('throws a 502 for a 5xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(client.restoreForSakhi(SAKHI_USER_ID, AUTH_HEADER)).rejects.toMatchObject({
      status: 502,
    });
  });
});
