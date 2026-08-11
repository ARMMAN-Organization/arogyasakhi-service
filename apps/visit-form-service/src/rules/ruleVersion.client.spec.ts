import { evaluateAncScheduleFull, findRuleVersion } from './ruleVersion.client';

describe('ruleVersion.client', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('findRuleVersion', () => {
    it('returns the rule version when rules-service returns 200', async () => {
      const version = { id: 'ver-1', ruleSetId: 'set-1', status: 'PUBLISHED' };
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: version }),
      });

      const result = await findRuleVersion('ver-1', 'Bearer test-token');

      expect(result).toEqual(version);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/rules/versions/ver-1'),
        expect.objectContaining({ headers: { Authorization: 'Bearer test-token' } }),
      );
    });

    it('returns null on 404', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });

      await expect(findRuleVersion('missing', 'Bearer test-token')).resolves.toBeNull();
    });

    it('throws a 502 when rules-service fails for a reason other than not-found', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 500 });

      await expect(findRuleVersion('ver-1', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });

    it('throws a 502 when rules-service is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      await expect(findRuleVersion('ver-1', 'Bearer test-token')).rejects.toMatchObject({
        status: 502,
      });
    });
  });

  describe('evaluateAncScheduleFull', () => {
    it('returns ruleVersionId and scheduleRows on 200', async () => {
      const data = {
        ruleVersionId: 'ver-1',
        scheduleRows: [
          {
            localScheduleUuid: 'anc-1',
            visitCode: 'ANC1',
            visitType: 'ANC',
            sequenceNo: 1,
            scheduledDate: '2026-08-11',
            windowStartDate: '2026-08-11',
            windowEndDate: '2026-08-16',
            anchorType: 'REGISTRATION',
            anchorVisitLocalUuid: null,
          },
        ],
      };
      fetchMock.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data }),
      });

      const result = await evaluateAncScheduleFull('2026-08-11', '2027-01-01', 'Bearer test-token');

      expect(result).toEqual(data);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/evaluate-schedule/anc-full'),
        expect.objectContaining({
          method: 'POST',
          headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
          body: JSON.stringify({ registrationDate: '2026-08-11', edd: '2027-01-01' }),
        }),
      );
    });

    it('throws a 502 when rules-service returns an error', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 400 });

      await expect(
        evaluateAncScheduleFull('2026-08-11', '2027-01-01', 'Bearer test-token'),
      ).rejects.toMatchObject({ status: 502 });
    });

    it('throws a 502 when rules-service is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      await expect(
        evaluateAncScheduleFull('2026-08-11', '2027-01-01', 'Bearer test-token'),
      ).rejects.toMatchObject({ status: 502 });
    });
  });
});
