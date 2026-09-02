/**
 * app.module.ts imports ./config/app-config, which calls process.exit(1) at
 * module-load time if DATABASE_URL isn't a valid URL — so it must be set
 * before that module is required (see approval-service's
 * lmp-change-request.routes.spec.ts for the same workaround).
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
import { registerFormRoutes } from './form.routes';
import type { FormService } from './form.service';

/**
 * Route/integration coverage for PATCH /form-submissions/:id/answers (this
 * task's new endpoint) — a real Express app + HTTP server, driven with
 * fetch(), so the actual validate()/requireRoles()/trustGatewayIdentity()
 * middleware chain runs, not just the service call a unit test would mock
 * around. Every other route on this router is pre-existing and unchanged;
 * not re-tested here.
 */
describe('form routes — PATCH /form-submissions/:id/answers', () => {
  const service = {
    updateSubmissionAnswers: jest.fn(),
  } as unknown as jest.Mocked<FormService>;

  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    const doc = createDocumentedRouter();
    registerFormRoutes(doc, service);
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

  const submissionId = '11111111-1111-1111-1111-111111111111';
  const validBody = {
    edits: [{ fieldCode: 'enter_the_beneficiary_address', value: 'New address' }],
  };
  const updatedSubmission = {
    id: submissionId,
    formVersionId: '22222222-2222-2222-2222-222222222222',
    beneficiaryId: '33333333-3333-3333-3333-333333333333',
    visitId: null,
    submittedByUserId: 'sakhi-user-1',
    submittedAt: '2026-09-01T00:00:00.000Z',
    localSubmissionUuid: 'device-abc-submission-001',
    formData: { enter_the_beneficiary_address: 'New address' },
    validationStatus: 'VALID',
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
  };

  it('as SAKHI with a valid allowlisted field: 200', async () => {
    service.updateSubmissionAnswers.mockResolvedValue(updatedSubmission as never);

    const res = await fetch(`${baseUrl}/form-submissions/${submissionId}/answers`, {
      method: 'PATCH',
      headers: { ...sakhiHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });
    const body = await jsonBody(res);

    expect(res.status).toBe(200);
    expect(body.data).toEqual(updatedSubmission);
    expect(service.updateSubmissionAnswers).toHaveBeenCalledWith(
      submissionId,
      validBody.edits,
      expect.objectContaining({ id: 'sakhi-user-1', roles: ['SAKHI'] }),
      expect.any(String),
    );
  });

  it('as SUPERVISOR: 403', async () => {
    const res = await fetch(`${baseUrl}/form-submissions/${submissionId}/answers`, {
      method: 'PATCH',
      headers: { ...supervisorHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(403);
    expect(service.updateSubmissionAnswers).not.toHaveBeenCalled();
  });

  it('unauthenticated: 401', async () => {
    const res = await fetch(`${baseUrl}/form-submissions/${submissionId}/answers`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(401);
    expect(service.updateSubmissionAnswers).not.toHaveBeenCalled();
  });

  it('rejects a non-uuid :id as 400', async () => {
    const res = await fetch(`${baseUrl}/form-submissions/not-a-uuid/answers`, {
      method: 'PATCH',
      headers: { ...sakhiHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(400);
    expect(service.updateSubmissionAnswers).not.toHaveBeenCalled();
  });

  it('rejects an empty edits array as 400', async () => {
    const res = await fetch(`${baseUrl}/form-submissions/${submissionId}/answers`, {
      method: 'PATCH',
      headers: { ...sakhiHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ edits: [] }),
    });

    expect(res.status).toBe(400);
    expect(service.updateSubmissionAnswers).not.toHaveBeenCalled();
  });

  it('rejects an unknown extra field as 400 (.strict())', async () => {
    const res = await fetch(`${baseUrl}/form-submissions/${submissionId}/answers`, {
      method: 'PATCH',
      headers: { ...sakhiHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({ ...validBody, extra: 'x' }),
    });

    expect(res.status).toBe(400);
    expect(service.updateSubmissionAnswers).not.toHaveBeenCalled();
  });

  it('propagates a 422 from the service when a field is not allowlisted', async () => {
    const { unprocessable } = jest.requireActual('@armman/service-commons');
    service.updateSubmissionAnswers.mockRejectedValue(
      unprocessable('The following field(s) are not editable after submission for form "X": y.'),
    );

    const res = await fetch(`${baseUrl}/form-submissions/${submissionId}/answers`, {
      method: 'PATCH',
      headers: { ...sakhiHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify(validBody),
    });

    expect(res.status).toBe(422);
  });
});
