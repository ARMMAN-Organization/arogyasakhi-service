import express from 'express';
import http from 'node:http';
import type { AuthenticatedUser } from '@armman/service-commons';
import {
  createDashboardRouter,
  degrade,
  fetchJson,
  resolveSakhiAndAuthorize,
} from './dashboard.controller';

/** Makes an inbound test request via Node's http client, independent of the
 * mocked global.fetch used for the route's own outbound downstream calls. */
function get(port: number, path: string, headers: Record<string, string> = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    http
      .get({ port, path, headers }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
      .on('error', reject);
  });
}

/** Same as `get` but also collects and JSON-parses the response body, for
 * tests that assert on the assembled dashboard payload's fields. */
function getJson(
  port: number,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    http
      .get({ port, path, headers }, (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : undefined });
        });
      })
      .on('error', reject);
  });
}

const AUTH_HEADER = 'Bearer test-token';

function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: '99999999-9999-9999-9999-999999999999',
    roles: ['SAKHI'],
    projectId: null,
    geographyUnitId: null,
    ...overrides,
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('fetchJson', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('returns the data field on a successful response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: { total: 5 } }));
    await expect(fetchJson('http://x/summary', caller(), AUTH_HEADER)).resolves.toEqual({
      total: 5,
    });
  });

  it('throws on a non-2xx response', async () => {
    fetchMock.mockResolvedValue(jsonResponse(500, {}));
    await expect(fetchJson('http://x/summary', caller(), AUTH_HEADER)).rejects.toThrow(
      'responded 500',
    );
  });

  it('sends both x-armman-* trusted-identity headers AND the original Authorization header', async () => {
    fetchMock.mockResolvedValue(jsonResponse(200, { data: {} }));
    await fetchJson(
      'http://x/summary',
      caller({ id: 'user-1', roles: ['SUPERVISOR'], projectId: 'project-1' }),
      AUTH_HEADER,
    );

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers).toMatchObject({
      Authorization: AUTH_HEADER,
      'x-armman-user-id': 'user-1',
      'x-armman-roles': 'SUPERVISOR',
      'x-armman-project-id': 'project-1',
    });
  });
});

describe('degrade', () => {
  it('returns the resolved value on success', async () => {
    await expect(degrade('test', Promise.resolve({ ok: true }))).resolves.toEqual({ ok: true });
  });

  it('returns null and does not throw when the promise rejects', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(degrade('test', Promise.reject(new Error('down')))).resolves.toBeNull();
    expect(consoleErrorSpy).toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});

describe('resolveSakhiAndAuthorize', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const SAKHI_ID = '11111111-1111-1111-1111-111111111111';

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('resolves the Sakhi for a self-requesting SAKHI caller', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: { sakhiId: SAKHI_ID, displayName: 'Priya Sharma', supervisorId: 'sup-1' },
      }),
    );

    const result = await resolveSakhiAndAuthorize(
      SAKHI_ID,
      caller({ id: SAKHI_ID, roles: ['SAKHI'] }),
      AUTH_HEADER,
    );

    expect(result.displayName).toBe('Priya Sharma');
  });

  it('403s when a SAKHI caller requests a different sakhiId', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: { sakhiId: SAKHI_ID, displayName: 'Priya Sharma', supervisorId: 'sup-1' },
      }),
    );

    await expect(
      resolveSakhiAndAuthorize(
        SAKHI_ID,
        caller({ id: 'someone-else', roles: ['SAKHI'] }),
        AUTH_HEADER,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows a SUPERVISOR to view a Sakhi in their own roster', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: { sakhiId: SAKHI_ID, displayName: 'Priya Sharma', supervisorId: 'sup-1' },
      }),
    );

    const result = await resolveSakhiAndAuthorize(
      SAKHI_ID,
      caller({ id: 'sup-1', roles: ['SUPERVISOR'] }),
      AUTH_HEADER,
    );
    expect(result.sakhiId).toBe(SAKHI_ID);
  });

  it('403s when a SUPERVISOR requests a Sakhi outside their roster', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: { sakhiId: SAKHI_ID, displayName: 'Priya Sharma', supervisorId: 'sup-1' },
      }),
    );

    await expect(
      resolveSakhiAndAuthorize(
        SAKHI_ID,
        caller({ id: 'sup-2', roles: ['SUPERVISOR'] }),
        AUTH_HEADER,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('allows a MANAGER/ADMIN caller unrestricted', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(200, {
        data: { sakhiId: SAKHI_ID, displayName: 'Priya Sharma', supervisorId: 'sup-1' },
      }),
    );

    await expect(
      resolveSakhiAndAuthorize(SAKHI_ID, caller({ roles: ['MANAGER'] }), AUTH_HEADER),
    ).resolves.toMatchObject({ sakhiId: SAKHI_ID });
  });

  it('404s when the Sakhi does not exist — this must NOT degrade gracefully', async () => {
    fetchMock.mockResolvedValue(jsonResponse(404, {}));

    await expect(
      resolveSakhiAndAuthorize(SAKHI_ID, caller({ roles: ['MANAGER'] }), AUTH_HEADER),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("forwards auth-service's own 403 as a 403, not a 500 — regression for a SAKHI caller whose token sub doesn't match sakhiId", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(403, { message: 'A Sakhi may only view their own profile.' }),
    );

    await expect(
      resolveSakhiAndAuthorize(SAKHI_ID, caller({ roles: ['SAKHI'] }), AUTH_HEADER),
    ).rejects.toMatchObject({ status: 403, message: 'A Sakhi may only view their own profile.' });
  });

  it('forwards a 401 from auth-service as a 401, not a 500', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, {}));

    await expect(
      resolveSakhiAndAuthorize(SAKHI_ID, caller({ roles: ['MANAGER'] }), AUTH_HEADER),
    ).rejects.toMatchObject({ status: 401 });
  });
});

describe('createDashboardRouter (route wiring)', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const SAKHI_ID = '11111111-1111-1111-1111-111111111111';

  const signer = { verify: jest.fn() };

  function buildApp() {
    const app = express();
    app.use(createDashboardRouter(signer));
    return app;
  }

  beforeEach(() => {
    fetchMock.mockReset();
    signer.verify.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('401s with no Authorization header', async () => {
    const app = buildApp();
    const server = app.listen(0);
    const { port } = server.address() as { port: number };
    const status = await get(port, `/sakhi/${SAKHI_ID}/dashboard`);
    expect(status).toBe(401);
    server.close();
  });

  it('401s on an invalid/expired token before any downstream fan-out occurs', async () => {
    signer.verify.mockRejectedValue(new Error('invalid'));
    const app = buildApp();
    const server = app.listen(0);
    const { port } = server.address() as { port: number };
    const status = await get(port, `/sakhi/${SAKHI_ID}/dashboard`, { Authorization: AUTH_HEADER });
    expect(status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    server.close();
  });

  /** Routes a mocked downstream fetch by URL substring, matching the 5
   * fan-out calls createDashboardRouter makes (sakhi/beneficiary/referral/
   * visit/sync). */
  function mockDownstream(responses: {
    sakhi?: unknown;
    beneficiary?: unknown | 'error';
    referral?: unknown | 'error';
    visit?: unknown | 'error';
    sync?: unknown | 'error';
  }) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes('/sakhis/')) return jsonResponse(200, { data: responses.sakhi });
      if (url.includes('/beneficiaries/registration-summary')) {
        return responses.beneficiary === 'error'
          ? jsonResponse(500, {})
          : jsonResponse(200, { data: responses.beneficiary });
      }
      if (url.includes('/referrals/referral-summary')) {
        return responses.referral === 'error'
          ? jsonResponse(500, {})
          : jsonResponse(200, { data: responses.referral });
      }
      if (url.includes('/visits/visit-summary')) {
        return responses.visit === 'error'
          ? jsonResponse(500, {})
          : jsonResponse(200, { data: responses.visit });
      }
      if (url.includes('/sync/last-synced')) {
        return responses.sync === 'error'
          ? jsonResponse(500, {})
          : jsonResponse(200, { data: responses.sync });
      }
      throw new Error(`unexpected downstream URL: ${url}`);
    });
  }

  const SAKHI_DATA = { sakhiId: SAKHI_ID, displayName: 'Priya Sharma', supervisorId: null };
  const BENEFICIARY_SUMMARY = {
    totalActiveBeneficiaries: 8,
    activeMothersCount: 5,
    activeChildrenCount: 3,
    activeMothersHighRiskCount: 2,
    activeChildrenHighRiskCount: 1,
    activeMothersPercent: 62.5,
    activeChildrenPercent: 37.5,
  };
  const VISIT_SUMMARY = {
    total: 10,
    byStatus: { PENDING: 4, MISSED: 2, COMPLETED: 4 },
    endingSoonVisitsCount: 3,
  };

  it('surfaces all 3 new fields when every downstream call succeeds', async () => {
    signer.verify.mockResolvedValue({ sub: SAKHI_ID, roles: ['SAKHI'] });
    mockDownstream({
      sakhi: SAKHI_DATA,
      beneficiary: BENEFICIARY_SUMMARY,
      referral: { accompaniedReferralsCount: 1, pendingFollowUpsCount: 0 },
      visit: VISIT_SUMMARY,
      sync: { lastSyncedAt: null },
    });
    const app = buildApp();
    const server = app.listen(0);
    const { port } = server.address() as { port: number };

    const { status, body } = await getJson(port, `/sakhi/${SAKHI_ID}/dashboard`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(200);
    const data = (body as { data: Record<string, unknown> }).data;
    expect(data.beneficiarySummary).toMatchObject({
      activeMothersHighRiskCount: 2,
      activeChildrenHighRiskCount: 1,
    });
    expect(data.visitSummary).toMatchObject({
      dueVisitsCount: 4,
      overdueVisitsCount: 2,
      endingSoonVisitsCount: 3,
    });
    server.close();
  });

  it('degrades beneficiarySummary to null (including the 2 new fields) when beneficiary-service fails, without affecting visitSummary', async () => {
    signer.verify.mockResolvedValue({ sub: SAKHI_ID, roles: ['SAKHI'] });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDownstream({
      sakhi: SAKHI_DATA,
      beneficiary: 'error',
      referral: { accompaniedReferralsCount: 0, pendingFollowUpsCount: 0 },
      visit: VISIT_SUMMARY,
      sync: { lastSyncedAt: null },
    });
    const app = buildApp();
    const server = app.listen(0);
    const { port } = server.address() as { port: number };

    const { status, body } = await getJson(port, `/sakhi/${SAKHI_ID}/dashboard`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(200);
    const data = (body as { data: Record<string, unknown> }).data;
    expect(data.beneficiarySummary).toBeNull();
    expect(data.visitSummary).toMatchObject({ endingSoonVisitsCount: 3 });
    consoleErrorSpy.mockRestore();
    server.close();
  });

  it('degrades visitSummary to null (including endingSoonVisitsCount) when visit-form-service fails, without affecting beneficiarySummary', async () => {
    signer.verify.mockResolvedValue({ sub: SAKHI_ID, roles: ['SAKHI'] });
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockDownstream({
      sakhi: SAKHI_DATA,
      beneficiary: BENEFICIARY_SUMMARY,
      referral: { accompaniedReferralsCount: 0, pendingFollowUpsCount: 0 },
      visit: 'error',
      sync: { lastSyncedAt: null },
    });
    const app = buildApp();
    const server = app.listen(0);
    const { port } = server.address() as { port: number };

    const { status, body } = await getJson(port, `/sakhi/${SAKHI_ID}/dashboard`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(200);
    const data = (body as { data: Record<string, unknown> }).data;
    expect(data.visitSummary).toBeNull();
    expect(data.beneficiarySummary).toMatchObject({
      activeMothersHighRiskCount: 2,
      activeChildrenHighRiskCount: 1,
    });
    consoleErrorSpy.mockRestore();
    server.close();
  });
});
