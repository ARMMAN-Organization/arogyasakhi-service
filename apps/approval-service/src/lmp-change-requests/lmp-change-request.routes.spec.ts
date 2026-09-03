/**
 * app.module.ts imports ./config/app-config, which calls process.exit(1) at
 * module-load time if DATABASE_URL isn't a valid URL — so it must be set
 * before that module is required (see referral.controller.spec.ts for the
 * same workaround).
 */
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';

import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  createDocumentedRouter,
  errorHandler,
  TRUSTED_USER_ID_HEADER,
  TRUSTED_ROLES_HEADER,
} from '@armman/service-commons';
import { registerLmpChangeRequestRoutes } from './lmp-change-request.routes';
import type { QuickResponseService } from '../quick-response/quick-response.service';
import type { LmpChangeRequestService } from './lmp-change-request.service';

/**
 * Route/integration coverage for POST /lmp-change-requests and GET
 * /lmp-change-requests (this task's new endpoints) — a real Express app +
 * HTTP server, driven with fetch(), so the actual
 * validate()/requireRoles()/trustGatewayIdentity() middleware chain runs,
 * not just the service call a unit test would mock around. GET /:id and
 * POST /:id/decision are pre-existing and unchanged; not re-tested here.
 */
describe('lmp-change-request routes', () => {
  const quickResponseService = {} as unknown as jest.Mocked<QuickResponseService>;
  const lmpChangeRequestService = {
    create: jest.fn(),
    listByBeneficiaryId: jest.fn(),
  } as unknown as jest.Mocked<LmpChangeRequestService>;

  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    const doc = createDocumentedRouter();
    registerLmpChangeRequestRoutes(doc, quickResponseService, lmpChangeRequestService);
    app.use(doc.router);
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

  async function jsonBody(
    res: Response,
  ): Promise<{ success: boolean; message: string; data?: unknown }> {
    return res.json() as Promise<{ success: boolean; message: string; data?: unknown }>;
  }

  const beneficiaryId = '22222222-2222-2222-2222-222222222222';
  const detail = {
    id: '11111111-1111-1111-1111-111111111111',
    beneficiaryId,
    oldLmpDate: null,
    newLmpDate: '2026-06-01T00:00:00.000Z',
    sonographyImageAssetId: null,
    requestedByUserId: 'sakhi-user-1',
    requestedAt: '2026-09-01T00:00:00.000Z',
    supervisorStatus: 'PENDING',
  };

  describe('POST /lmp-change-requests', () => {
    const validBody = {
      beneficiaryId,
      newLmpDate: '2026-06-01',
      localRequestUuid: 'device-abc-lmp-001',
    };

    it('as SAKHI: 201 on first creation', async () => {
      lmpChangeRequestService.create.mockResolvedValue({ detail, wasCreated: true });

      const res = await fetch(`${baseUrl}/lmp-change-requests`, {
        method: 'POST',
        headers: { ...sakhiHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });
      const body = await jsonBody(res);

      expect(res.status).toBe(201);
      expect(body.data).toEqual(detail);
      expect(lmpChangeRequestService.create).toHaveBeenCalledWith(
        expect.objectContaining({ beneficiaryId, localRequestUuid: 'device-abc-lmp-001' }),
        'sakhi-user-1',
        expect.any(String),
      );
    });

    it('as SAKHI: 200 on idempotent replay (same localRequestUuid)', async () => {
      lmpChangeRequestService.create.mockResolvedValue({ detail, wasCreated: false });

      const res = await fetch(`${baseUrl}/lmp-change-requests`, {
        method: 'POST',
        headers: { ...sakhiHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.data).toEqual(detail);
    });

    it('as SUPERVISOR: 403', async () => {
      const res = await fetch(`${baseUrl}/lmp-change-requests`, {
        method: 'POST',
        headers: { ...supervisorHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(403);
      expect(lmpChangeRequestService.create).not.toHaveBeenCalled();
    });

    it('unauthenticated: 401', async () => {
      const res = await fetch(`${baseUrl}/lmp-change-requests`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(validBody),
      });

      expect(res.status).toBe(401);
      expect(lmpChangeRequestService.create).not.toHaveBeenCalled();
    });

    it('rejects a missing localRequestUuid as 400', async () => {
      const { localRequestUuid: _omit, ...rest } = validBody;
      const res = await fetch(`${baseUrl}/lmp-change-requests`, {
        method: 'POST',
        headers: { ...sakhiHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify(rest),
      });

      expect(res.status).toBe(400);
      expect(lmpChangeRequestService.create).not.toHaveBeenCalled();
    });

    it('rejects a non-uuid beneficiaryId as 400', async () => {
      const res = await fetch(`${baseUrl}/lmp-change-requests`, {
        method: 'POST',
        headers: { ...sakhiHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody, beneficiaryId: 'not-a-uuid' }),
      });

      expect(res.status).toBe(400);
      expect(lmpChangeRequestService.create).not.toHaveBeenCalled();
    });

    it('rejects an unknown extra field as 400 (.strict())', async () => {
      const res = await fetch(`${baseUrl}/lmp-change-requests`, {
        method: 'POST',
        headers: { ...sakhiHeaders(), 'content-type': 'application/json' },
        body: JSON.stringify({ ...validBody, extra: 'x' }),
      });

      expect(res.status).toBe(400);
      expect(lmpChangeRequestService.create).not.toHaveBeenCalled();
    });
  });

  describe('GET /lmp-change-requests', () => {
    it("as SAKHI with ?beneficiaryId=X: 200, only that beneficiary's rows", async () => {
      lmpChangeRequestService.listByBeneficiaryId.mockResolvedValue([detail]);

      const res = await fetch(`${baseUrl}/lmp-change-requests?beneficiaryId=${beneficiaryId}`, {
        headers: sakhiHeaders(),
      });
      const body = await jsonBody(res);

      expect(res.status).toBe(200);
      expect(body.data).toEqual([detail]);
      expect(lmpChangeRequestService.listByBeneficiaryId).toHaveBeenCalledWith(
        beneficiaryId,
        expect.any(String),
      );
    });

    it('as SUPERVISOR with ?beneficiaryId=X: 200', async () => {
      lmpChangeRequestService.listByBeneficiaryId.mockResolvedValue([]);

      const res = await fetch(`${baseUrl}/lmp-change-requests?beneficiaryId=${beneficiaryId}`, {
        headers: supervisorHeaders(),
      });

      expect(res.status).toBe(200);
    });

    it('missing beneficiaryId query param: 400 VALIDATION_ERROR', async () => {
      const res = await fetch(`${baseUrl}/lmp-change-requests`, { headers: sakhiHeaders() });
      const body = await jsonBody(res);

      expect(res.status).toBe(400);
      expect((body as { errorCode?: string }).errorCode).toBe('VALIDATION_ERROR');
      expect(lmpChangeRequestService.listByBeneficiaryId).not.toHaveBeenCalled();
    });

    it('unauthenticated: 401', async () => {
      const res = await fetch(`${baseUrl}/lmp-change-requests?beneficiaryId=${beneficiaryId}`);

      expect(res.status).toBe(401);
      expect(lmpChangeRequestService.listByBeneficiaryId).not.toHaveBeenCalled();
    });
  });
});
