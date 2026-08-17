import express, { type Application } from 'express';
import type { Server } from 'node:http';
import http from 'node:http';
import { errorHandler, notFoundHandler } from '@armman/service-commons';
import { createPadaVisitsRouter } from './pada-visits.controller';

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
const PADA_ID = '22222222-2222-2222-2222-222222222222';

function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

describe('createPadaVisitsRouter (route wiring)', () => {
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const signer = { verify: jest.fn() };
  let server: Server | undefined;

  function buildApp(): Application {
    const app = express();
    app.use(createPadaVisitsRouter(signer));
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

  const padaBreakdownRow = {
    padaId: PADA_ID,
    padaName: 'Pada One',
    villageName: 'Village One',
    beneficiaries: [
      { id: 'ben-1', caseType: 'MOTHER' },
      { id: 'ben-2', caseType: 'CHILD' },
    ],
  };

  it('401s with no Authorization header', async () => {
    const port = await startServer();
    const { status } = await get(port, `/padas/${PADA_ID}/visits?status=open`);
    expect(status).toBe(401);
  });

  it("400s when status isn't open or referral_follow_up", async () => {
    signer.verify.mockResolvedValue({ sub: 'caller-1', roles: ['ADMIN'] });

    const port = await startServer();
    const { status } = await get(port, `/padas/${PADA_ID}/visits?status=bogus`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(400);
  });

  it('403s when the caller has no beneficiaries in this pada', async () => {
    signer.verify.mockResolvedValue({ sub: 'caller-1', roles: ['SAKHI'] });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [] })); // pada-breakdown: no rows

    const port = await startServer();
    const { status } = await get(port, `/padas/${PADA_ID}/visits?status=open`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(403);
  });

  it('hard-fails when beneficiary-service pada-breakdown is unreachable', async () => {
    signer.verify.mockResolvedValue({ sub: 'caller-1', roles: ['ADMIN'] });
    fetchMock.mockResolvedValueOnce(jsonResponse(500, {}));

    const port = await startServer();
    const { status } = await get(port, `/padas/${PADA_ID}/visits?status=open`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(502);
  });

  it('returns open-tab visit cards with beneficiary name/phone/riskLevel, plus both tab counts', async () => {
    signer.verify.mockResolvedValue({ sub: 'caller-1', roles: ['ADMIN'] });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { data: [padaBreakdownRow] })) // pada-breakdown
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [
            {
              visitId: 'visit-1',
              beneficiaryId: 'ben-1',
              visitType: 'ANC 3',
              dueDate: '2026-08-20',
            },
          ],
        }),
      ) // visits/by-pada
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [{ followupId: 'followup-1', beneficiaryId: 'ben-2', followupDate: '2026-08-15' }],
        }),
      ) // referrals/followups-by-beneficiary
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [
            {
              id: 'ben-1',
              beneficiaryName: 'Jane Doe',
              phoneNumber: '9876543210',
              riskLevel: 'moderate',
            },
          ],
        }),
      ); // beneficiaries/by-ids-with-risk

    const port = await startServer();
    const { status, body } = await get(
      port,
      `/padas/${PADA_ID}/visits?status=open&date=2026-08-20`,
      { Authorization: AUTH_HEADER },
    );

    expect(status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: 'OK',
      data: {
        openCount: 1,
        referralFollowUpCount: 1,
        visits: [
          {
            visitId: 'visit-1',
            beneficiaryId: 'ben-1',
            beneficiaryName: 'Jane Doe',
            caseType: 'mother',
            riskLevel: 'moderate',
            padaName: 'Pada One',
            villageName: 'Village One',
            scheduledDate: '2026-08-20',
            visitType: 'ANC 3',
            dueDate: '2026-08-20',
            phoneNumber: '9876543210',
          },
        ],
      },
    });
  });

  it('returns referral_follow_up-tab cards with visitId null and visitType "Referral Follow-up"', async () => {
    signer.verify.mockResolvedValue({ sub: 'caller-1', roles: ['ADMIN'] });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { data: [padaBreakdownRow] }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [] })) // visits/by-pada (open tab, still fetched for count)
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [{ followupId: 'followup-1', beneficiaryId: 'ben-2', followupDate: '2026-08-15' }],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [
            { id: 'ben-2', beneficiaryName: 'Asha Kumari', phoneNumber: null, riskLevel: 'high' },
          ],
        }),
      );

    const port = await startServer();
    const { status, body } = await get(port, `/padas/${PADA_ID}/visits?status=referral_follow_up`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(200);
    expect(body).toMatchObject({
      data: {
        openCount: 0,
        referralFollowUpCount: 1,
        visits: [
          {
            visitId: null,
            beneficiaryId: 'ben-2',
            beneficiaryName: 'Asha Kumari',
            caseType: 'infant',
            riskLevel: 'high',
            visitType: 'Referral Follow-up',
            scheduledDate: '2026-08-15',
            dueDate: '2026-08-15',
            phoneNumber: null,
          },
        ],
      },
    });
  });

  it('degrades beneficiaryName/riskLevel/phoneNumber to null when beneficiary-service fails, without failing the whole request', async () => {
    signer.verify.mockResolvedValue({ sub: 'caller-1', roles: ['ADMIN'] });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { data: [padaBreakdownRow] }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [
            {
              visitId: 'visit-1',
              beneficiaryId: 'ben-1',
              visitType: 'ANC 3',
              dueDate: '2026-08-20',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }))
      .mockResolvedValueOnce(jsonResponse(500, {})); // by-ids-with-risk fails

    const port = await startServer();
    const { status, body } = await get(
      port,
      `/padas/${PADA_ID}/visits?status=open&date=2026-08-20`,
      { Authorization: AUTH_HEADER },
    );

    expect(status).toBe(200);
    expect(body).toMatchObject({
      data: {
        visits: [
          {
            visitId: 'visit-1',
            beneficiaryName: null,
            riskLevel: null,
            phoneNumber: null,
          },
        ],
      },
    });
  });

  it('maps beneficiary-service MOTHER/CHILD to card mother/infant caseType', async () => {
    signer.verify.mockResolvedValue({ sub: 'caller-1', roles: ['ADMIN'] });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { data: [padaBreakdownRow] }))
      .mockResolvedValueOnce(
        jsonResponse(200, {
          data: [
            {
              visitId: 'visit-1',
              beneficiaryId: 'ben-1',
              visitType: 'ANC 3',
              dueDate: '2026-08-20',
            },
            {
              visitId: 'visit-2',
              beneficiaryId: 'ben-2',
              visitType: 'INC 2',
              dueDate: '2026-08-20',
            },
          ],
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }));

    const port = await startServer();
    const { body } = await get(port, `/padas/${PADA_ID}/visits?status=open&date=2026-08-20`, {
      Authorization: AUTH_HEADER,
    });

    const visits = (body as { data: { visits: { beneficiaryId: string; caseType: string }[] } })
      .data.visits;
    expect(visits.find((v) => v.beneficiaryId === 'ben-1')?.caseType).toBe('mother');
    expect(visits.find((v) => v.beneficiaryId === 'ben-2')?.caseType).toBe('infant');
  });

  it('defaults date to today when omitted', async () => {
    signer.verify.mockResolvedValue({ sub: 'caller-1', roles: ['ADMIN'] });
    fetchMock
      .mockResolvedValueOnce(jsonResponse(200, { data: [padaBreakdownRow] }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }))
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }));

    const port = await startServer();
    const { status } = await get(port, `/padas/${PADA_ID}/visits?status=open`, {
      Authorization: AUTH_HEADER,
    });

    expect(status).toBe(200);
    const byPadaCall = fetchMock.mock.calls[1];
    const requestBody = JSON.parse((byPadaCall[1] as { body: string }).body);
    expect(requestBody.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
