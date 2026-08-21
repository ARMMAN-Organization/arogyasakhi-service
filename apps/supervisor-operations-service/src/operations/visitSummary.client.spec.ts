/**
 * `visitSummary.client.ts` imports `appConfig`, which calls `process.exit(1)`
 * at module-load time if `DATABASE_URL` isn't set — true in CI, unlike local
 * dev's `.env` — so it must be set before the module under test is required
 * (matches mediaAsset.controller.spec.ts's same workaround).
 */
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';

const { VisitSummaryClient } =
  require('./visitSummary.client') as typeof import('./visitSummary.client');

describe('VisitSummaryClient', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  let client: InstanceType<typeof VisitSummaryClient>;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = fetchMock as unknown as typeof fetch;
    client = new VisitSummaryClient();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the visit summary on a successful response', async () => {
    const summary = { total: 3, byStatus: { COMPLETED: 2, MISSED: 1 }, endingSoonVisitsCount: 1 };
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ data: summary }) });

    await expect(client.getBySakhi('sakhi-1', {}, 'Bearer test-token')).resolves.toEqual(summary);

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toContain('/visits/visit-summary?');
    expect(url).toContain('sakhiId=sakhi-1');
    expect(options).toEqual({ headers: { Authorization: 'Bearer test-token' } });
  });

  it('passes fromDate/toDate through as query params when provided', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { total: 0, byStatus: {}, endingSoonVisitsCount: 0 } }),
    });

    await client.getBySakhi(
      'sakhi-1',
      { fromDate: '2026-01-01', toDate: '2026-01-31' },
      'Bearer test-token',
    );

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('fromDate=2026-01-01');
    expect(url).toContain('toDate=2026-01-31');
  });

  it('rejects with the upstream status/message on a 4xx passthrough (e.g. roster reject)', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 403,
      json: async () => ({ message: 'Sakhi not assigned to caller.' }),
    });

    await expect(client.getBySakhi('sakhi-1', {}, 'Bearer test-token')).rejects.toMatchObject({
      status: 403,
      message: 'Sakhi not assigned to caller.',
    });
  });

  it('falls back to a default message when the 4xx body is unparseable', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => {
        throw new Error('not json');
      },
    });

    await expect(client.getBySakhi('sakhi-1', {}, 'Bearer test-token')).rejects.toMatchObject({
      status: 404,
      message: 'Unable to fetch the visit summary.',
    });
  });

  it('throws a badGateway error on a 5xx response', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await expect(client.getBySakhi('sakhi-1', {}, 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });

  it('throws a badGateway error on a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    await expect(client.getBySakhi('sakhi-1', {}, 'Bearer test-token')).rejects.toMatchObject({
      status: 502,
    });
  });
});
