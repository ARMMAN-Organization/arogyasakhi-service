/**
 * referral.controller.ts imports from ../app.module, which imports
 * ./config/app-config, which calls process.exit(1) at module-load time if
 * DATABASE_URL isn't a valid URL — so it must be set before the module
 * under test is required (see riskCondition.controller.spec.ts for the
 * same workaround).
 */
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';

import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  errorHandler,
  badRequest,
  conflict,
  notFound,
  TRUSTED_USER_ID_HEADER,
  TRUSTED_ROLES_HEADER,
} from '@armman/service-commons';
import { createReferralRouter } from './referral.controller';
import type { ReferralService } from './referral.service';

/**
 * Route/integration coverage for GET /referrals (beneficiaryId filter) and
 * PATCH /referrals/:id/decision (decisionNotes + REFILL no-longer-no-op) —
 * a real Express app + HTTP server, driven with fetch(), so the actual
 * validate()/requireRoles()/trustGatewayIdentity() middleware chain runs,
 * not just the service call a unit test would mock around.
 */
describe('referral routes', () => {
  const service = {
    list: jest.fn(),
    decide: jest.fn(),
  } as unknown as jest.Mocked<ReferralService>;
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(createReferralRouter(service).router);
    app.use(errorHandler);
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
  });

  beforeEach(() => {
    jest.resetAllMocks();
  });

  function sakhiHeaders() {
    return {
      [TRUSTED_USER_ID_HEADER]: 'sakhi-user-1',
      [TRUSTED_ROLES_HEADER]: 'SAKHI',
      authorization: 'Bearer test-token',
    };
  }

  function supervisorHeaders() {
    return {
      [TRUSTED_USER_ID_HEADER]: 'supervisor-user-1',
      [TRUSTED_ROLES_HEADER]: 'SUPERVISOR',
      authorization: 'Bearer test-token',
    };
  }

  /** Parses a fetch Response's JSON body as the standard success/failure envelope. */
  async function jsonBody(
    res: Response,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    return res.json() as Promise<{ success: boolean; message: string; data?: unknown }>;
  }

  describe('GET /referrals', () => {
    it('as SAKHI with no beneficiaryId: service.list enforces the 400 (unscoped listing is MANAGER-only — security review fix, 2026-09-02)', async () => {
      service.list.mockRejectedValue(
        badRequest('beneficiaryId is required for SAKHI/SUPERVISOR callers.'),
      );

      const res = await fetch(`${baseUrl}/referrals`, { headers: sakhiHeaders() });

      expect(res.status).toBe(400);
      expect(service.list).toHaveBeenCalledWith(undefined, expect.anything(), 'Bearer test-token');
    });

    it('as SAKHI with ?beneficiaryId=X: 200, filtered, with caller/authorizationHeader forwarded for ownership scoping', async () => {
      const beneficiaryId = '22222222-2222-2222-2222-222222222222';
      service.list.mockResolvedValue([]);

      const res = await fetch(`${baseUrl}/referrals?beneficiaryId=${beneficiaryId}`, {
        headers: sakhiHeaders(),
      });
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(service.list).toHaveBeenCalledWith(
        beneficiaryId,
        expect.anything(),
        'Bearer test-token',
      );
    });

    it('rejects a non-uuid beneficiaryId as 400', async () => {
      const res = await fetch(`${baseUrl}/referrals?beneficiaryId=not-a-uuid`, {
        headers: sakhiHeaders(),
      });

      expect(res.status).toBe(400);
      expect(service.list).not.toHaveBeenCalled();
    });
  });

  describe('PATCH /referrals/:id/decision', () => {
    const referralId = '11111111-1111-1111-1111-111111111111';

    it('REFILL with decisionNotes: 200, response includes the new fields and unchanged status', async () => {
      const decided = {
        id: referralId,
        status: 'PENDING_FOLLOWUP',
        decidedByUserId: 'supervisor-user-1',
        decidedAt: new Date().toISOString(),
        decisionNotes: 'Beneficiary unavailable, retry next week.',
      };
      service.decide.mockResolvedValue(decided as never);

      const res = await fetch(`${baseUrl}/referrals/${referralId}/decision`, {
        method: 'PATCH',
        headers: { ...supervisorHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({
          decision: 'REFILL',
          decisionNotes: 'Beneficiary unavailable, retry next week.',
        }),
      });
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.data).toEqual(decided);
      expect((body.data as { status: string }).status).toBe('PENDING_FOLLOWUP');
      expect(service.decide).toHaveBeenCalledWith(
        referralId,
        { decision: 'REFILL', decisionNotes: 'Beneficiary unavailable, retry next week.' },
        expect.objectContaining({ id: 'supervisor-user-1' }),
        expect.any(String),
      );
    });

    it('rejects an unknown extra field as 400 (.strict())', async () => {
      const res = await fetch(`${baseUrl}/referrals/${referralId}/decision`, {
        method: 'PATCH',
        headers: { ...supervisorHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'REFILL', extra: 'x' }),
      });

      expect(res.status).toBe(400);
      expect(service.decide).not.toHaveBeenCalled();
    });

    it('propagates a 409 from the service (non-PENDING_FOLLOWUP referral)', async () => {
      service.decide.mockRejectedValue(conflict('Cannot decide a referral with status LAPSED.'));

      const res = await fetch(`${baseUrl}/referrals/${referralId}/decision`, {
        method: 'PATCH',
        headers: { ...supervisorHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'LAPSE' }),
      });

      expect(res.status).toBe(409);
    });

    it('propagates a 404 from the service (nonexistent referral)', async () => {
      service.decide.mockRejectedValue(notFound('Referral not found.'));

      const res = await fetch(`${baseUrl}/referrals/${referralId}/decision`, {
        method: 'PATCH',
        headers: { ...supervisorHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'LAPSE' }),
      });

      expect(res.status).toBe(404);
    });
  });
});
