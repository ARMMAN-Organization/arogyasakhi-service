import { isStillbirthOutcome, resolveDeliveryOutcomesBySlot } from './deliveryOutcomes.client';

function outcomesResponse(outcomes: { birthOrder: number; outcome: string }[]) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data: { outcomes } }),
  };
}

describe('resolveDeliveryOutcomesBySlot', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the per-slot outcomes as-is, each tagged with its own birthOrder', async () => {
    fetchMock.mockResolvedValue(
      outcomesResponse([
        { birthOrder: 1, outcome: 'live_birth' },
        { birthOrder: 2, outcome: 'antepartum_still_birth_fresh' },
      ]),
    );

    const result = await resolveDeliveryOutcomesBySlot('mother-1', 'Bearer test-token');

    expect(result).toEqual([
      { birthOrder: 1, outcome: 'live_birth' },
      { birthOrder: 2, outcome: 'antepartum_still_birth_fresh' },
    ]);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/beneficiaries/mother-1/delivery-outcomes'),
      { headers: { Authorization: 'Bearer test-token' } },
    );
  });

  it('returns an empty array when the mother has no DELIVERY_VISIT submission yet', async () => {
    fetchMock.mockResolvedValue(outcomesResponse([]));

    const result = await resolveDeliveryOutcomesBySlot('mother-1', 'Bearer test-token');

    expect(result).toEqual([]);
  });

  it('throws (does not degrade to a safe default) when visit-form-service returns a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(resolveDeliveryOutcomesBySlot('mother-1', 'Bearer test-token')).rejects.toThrow();
  });

  it('throws (does not degrade to a safe default) when visit-form-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(resolveDeliveryOutcomesBySlot('mother-1', 'Bearer test-token')).rejects.toThrow();
  });
});

describe('isStillbirthOutcome', () => {
  it('treats both stillbirth outcome value_codes as stillbirths', () => {
    expect(isStillbirthOutcome('antepartum_still_birth_fresh')).toBe(true);
    expect(isStillbirthOutcome('intrapartum_still_birth_macerated')).toBe(true);
  });

  it('does not treat live_birth as a stillbirth', () => {
    expect(isStillbirthOutcome('live_birth')).toBe(false);
  });
});
