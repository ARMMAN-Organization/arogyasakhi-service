import { resolveRiskConditions } from './riskCondition.client';

function riskConditionsResponse(
  data: { id: string; conditionCode: string; conditionName: string; gradeScale: string }[],
) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data }),
  };
}

describe('resolveRiskConditions', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns an empty Map without calling fetch when given no ids', async () => {
    const result = await resolveRiskConditions([], 'Bearer test-token');

    expect(result.size).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('calls risk-referral-service with a comma-separated ids batch and the forwarded auth header', async () => {
    fetchMock.mockResolvedValue(
      riskConditionsResponse([
        {
          id: 'rc-1',
          conditionCode: 'HYPERTENSION_HIGH_BP',
          conditionName: 'Hypertension / High BP',
          gradeScale: 'NORMAL_LOW_MEDIUM_HIGH',
        },
      ]),
    );

    const result = await resolveRiskConditions(['rc-1', 'rc-2'], 'Bearer test-token');

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/risk-conditions?ids=rc-1,rc-2'),
      { headers: { Authorization: 'Bearer test-token' } },
    );
    expect(result.get('rc-1')).toEqual({
      conditionCode: 'HYPERTENSION_HIGH_BP',
      conditionName: 'Hypertension / High BP',
      gradeScale: 'NORMAL_LOW_MEDIUM_HIGH',
    });
  });

  it('omits an id with no matching row from the returned Map, without throwing', async () => {
    fetchMock.mockResolvedValue(riskConditionsResponse([]));

    const result = await resolveRiskConditions(['rc-unseeded'], 'Bearer test-token');

    expect(result.has('rc-unseeded')).toBe(false);
  });

  it('throws 502 when the risk-referral-service call rejects (network error/timeout)', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(resolveRiskConditions(['rc-1'], 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('throws 502 when risk-referral-service returns a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500, json: () => Promise.resolve({}) });

    await expect(resolveRiskConditions(['rc-1'], 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });
});
