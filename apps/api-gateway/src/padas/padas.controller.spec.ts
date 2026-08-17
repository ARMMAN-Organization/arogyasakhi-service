import express, { type Application } from 'express';
import type { Server } from 'node:http';
import http from 'node:http';
import { errorHandler, notFoundHandler } from '@armman/service-commons';
import { createPadasRouter } from './padas.controller';

/** Makes an inbound test request via Node's http client, independent of the
 * mocked global.fetch used for the route's own outbound downstream calls. */
function get(
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
          try {
            resolve({ status: res.statusCode ?? 0, body: raw ? JSON.parse(raw) : null });
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

const AUTH_HEADER = 'Bearer test-token';
const SAKHI_ID = '11111111-1111-1111-1111-111111111111';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('createPadasRouter (route wiring)', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const signer = { verify: jest.fn() };
  let server: Server | undefined;

  function buildApp(): Application {
    const app = express();
    app.use(createPadasRouter(signer));
    app.use(notFoundHandler);
    app.use(errorHandler);
    return app;
  }

  async function startServer(): Promise<number> {
    const app = buildApp();
    server = app.listen(0);
    await new Promise<void>((resolve) => server?.once('listening', resolve));
    return (server.address() as { port: number }).port;
  }

  beforeEach(() => {
    fetchMock.mockReset();
    signer.verify.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(async () => {
    if (server) {
      await closeServer(server);
      server = undefined;
    }
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('401s with no Authorization header', async () => {
    const port = await startServer();
    const { status } = await get(port, `/sakhi/${SAKHI_ID}/padas`);
    expect(status).toBe(401);
  });

  it('returns padas: [] when the Sakhi has no beneficiaries in any pada, without calling visit/referral services', async () => {
    signer.verify.mockResolvedValue({ sub: SAKHI_ID, roles: ['SAKHI'] });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { sakhiId: SAKHI_ID, displayName: 'Priya', supervisorId: null },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }));

    const port = await startServer();
    const { status, body } = await get(port, `/sakhi/${SAKHI_ID}/padas`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, message: 'OK', data: { padas: [] } });
    expect(fetchMock).toHaveBeenCalledTimes(2); // sakhi lookup + pada-breakdown, nothing else
  });

  it('splits open/referralFollowUp counts by Women/Child and sums dueTodayCount into visitsRemainingCount', async () => {
    signer.verify.mockResolvedValue({ sub: SAKHI_ID, roles: ['SAKHI'] });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { sakhiId: SAKHI_ID, displayName: 'Priya', supervisorId: null },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [
            {
              padaId: 'pada-1',
              padaName: 'Pada One',
              villageName: 'Village One',
              beneficiaries: [
                { id: 'mother-1', caseType: 'MOTHER' },
                { id: 'mother-2', caseType: 'MOTHER' },
                { id: 'child-1', caseType: 'CHILD' },
              ],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: {
            'mother-1': { dueVisitsCount: 1, overdueVisitsCount: 0, dueTodayCount: 1 },
            'mother-2': { dueVisitsCount: 0, overdueVisitsCount: 1, dueTodayCount: 1 },
            'child-1': { dueVisitsCount: 1, overdueVisitsCount: 0, dueTodayCount: 0 },
          },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: {
            'mother-1': { pendingCount: 1, overdueCount: 0 },
            'child-1': { pendingCount: 1, overdueCount: 1 },
          },
        }),
      );

    const port = await startServer();
    const { status, body } = await get(port, `/sakhi/${SAKHI_ID}/padas`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: 'OK',
      data: {
        padas: [
          {
            padaId: 'pada-1',
            padaName: 'Pada One',
            villageName: 'Village One',
            open: {
              womenCount: 1, // mother-1 has a due visit (mother-2 doesn't)
              womenOverdueCount: 1, // mother-2 has an overdue visit
              childCount: 1,
              childOverdueCount: 0,
            },
            referralFollowUp: {
              womenCount: 1, // mother-1 has a pending followup
              womenOverdueCount: 0,
              childCount: 1, // child-1 has a pending followup
              childOverdueCount: 1, // child-1's is overdue
            },
            visitsRemainingCount: 2, // mother-1 (1) + mother-2 (1) + child-1 (0)
          },
        ],
      },
    });
  });

  it('degrades open/visitsRemainingCount and referralFollowUp independently to 0 when those services fail', async () => {
    signer.verify.mockResolvedValue({ sub: SAKHI_ID, roles: ['SAKHI'] });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { sakhiId: SAKHI_ID, displayName: 'Priya', supervisorId: null },
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [
            {
              padaId: 'pada-1',
              padaName: 'Pada One',
              villageName: 'Village One',
              beneficiaries: [{ id: 'mother-1', caseType: 'MOTHER' }],
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(500, {}))
      .mockResolvedValueOnce(jsonResponse(500, {}));

    const port = await startServer();
    const { status, body } = await get(port, `/sakhi/${SAKHI_ID}/padas`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: 'OK',
      data: {
        padas: [
          {
            padaId: 'pada-1',
            padaName: 'Pada One',
            villageName: 'Village One',
            open: { womenCount: 0, womenOverdueCount: 0, childCount: 0, childOverdueCount: 0 },
            referralFollowUp: {
              womenCount: 0,
              womenOverdueCount: 0,
              childCount: 0,
              childOverdueCount: 0,
            },
            visitsRemainingCount: 0,
          },
        ],
      },
    });
  });

  it('hard-fails (does not degrade) when beneficiary-service pada-breakdown fails', async () => {
    signer.verify.mockResolvedValue({ sub: SAKHI_ID, roles: ['SAKHI'] });
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: { sakhiId: SAKHI_ID, displayName: 'Priya', supervisorId: null },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(500, {}));

    const port = await startServer();
    const { status } = await get(port, `/sakhi/${SAKHI_ID}/padas`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(502);
  });

  it('404s when the Sakhi does not exist', async () => {
    signer.verify.mockResolvedValue({ sub: SAKHI_ID, roles: ['SAKHI'] });
    fetchMock.mockResolvedValueOnce(jsonResponse(404, {}));

    const port = await startServer();
    const { status } = await get(port, `/sakhi/${SAKHI_ID}/padas`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(404);
  });

  it("403s when a SAKHI caller requests a different sakhiId's padas", async () => {
    signer.verify.mockResolvedValue({ sub: 'someone-else', roles: ['SAKHI'] });
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        data: { sakhiId: SAKHI_ID, displayName: 'Priya', supervisorId: null },
      }),
    );

    const port = await startServer();
    const { status } = await get(port, `/sakhi/${SAKHI_ID}/padas`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(403);
  });
});
