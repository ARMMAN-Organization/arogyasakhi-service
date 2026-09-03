import { generateHrVisitSchedule } from './visitScheduleGenerate.client';

describe('generateHrVisitSchedule', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('POSTs scheduleKind HR with the given beneficiaryId/phase/hrDetectedThisVisit/actualCompletionDate', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 201 });
    global.fetch = fetchMock as never;

    const result = await generateHrVisitSchedule(
      'beneficiary-1',
      { phase: 'ANC', hrDetectedThisVisit: true, actualCompletionDate: '2026-09-01' },
      'Bearer test-token',
    );

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/visit-schedules/generate'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer test-token' }),
        body: JSON.stringify({
          beneficiaryId: 'beneficiary-1',
          scheduleKind: 'HR',
          phase: 'ANC',
          hrDetectedThisVisit: true,
          actualCompletionDate: '2026-09-01',
        }),
      }),
    );
  });

  it('returns {ok:false, error} on a non-2xx response, without throwing', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 502 }) as never;

    const result = await generateHrVisitSchedule(
      'beneficiary-1',
      { phase: 'INC', hrDetectedThisVisit: true, actualCompletionDate: '2026-09-01' },
      'Bearer test-token',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain('502');
  });

  it('returns {ok:false, error} when fetch itself throws (network failure), without throwing', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as never;

    const result = await generateHrVisitSchedule(
      'beneficiary-1',
      { phase: 'CCV', hrDetectedThisVisit: true, actualCompletionDate: '2026-09-01' },
      'Bearer test-token',
    );

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe('network down');
  });
});
