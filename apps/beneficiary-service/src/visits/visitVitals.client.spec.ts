import { resolveLatestVisitVitals } from './visitVitals.client';

function vitalsResponse(data: Record<string, unknown>) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ success: true, data }),
  };
}

describe('resolveLatestVisitVitals', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the vitals snapshot on success', async () => {
    const data = {
      visitId: 'visit-1',
      submittedAt: '2026-08-01T00:00:00.000Z',
      weightKg: 58.5,
      systolicBp: 120,
      diastolicBp: 80,
      temperatureF: 98.6,
      hemoglobinGDl: 11.2,
      muacCm: 24.5,
      respiratoryRate: null,
    };
    fetchMock.mockResolvedValue(vitalsResponse(data));

    const result = await resolveLatestVisitVitals('ben-1', 'Bearer test-token');

    expect(result).toEqual(data);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/beneficiaries/ben-1/latest-visit-vitals'),
      { headers: { Authorization: 'Bearer test-token' } },
    );
  });

  it('returns null (not a throw) when visit-form-service returns a non-ok response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const result = await resolveLatestVisitVitals('ben-1', 'Bearer test-token');

    expect(result).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });

  it('returns null (not a throw) when visit-form-service is unreachable', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await resolveLatestVisitVitals('ben-1', 'Bearer test-token');

    expect(result).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalled();
  });
});
