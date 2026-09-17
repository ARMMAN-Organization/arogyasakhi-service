/**
 * app.module.ts imports ./config/app-config, which calls process.exit(1) at
 * module-load time if DATABASE_URL/PII keys aren't set — so they must be set
 * before that module is required (see visit-form-service's
 * form.routes.spec.ts for the same workaround). Same for
 * INTERNAL_HEADER_SECRET: trust-gateway-identity.ts reads it once at module
 * load and fails closed (401) if unset.
 */
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';
process.env.PII_ENCRYPTION_KEY ??= Buffer.alloc(32, 1).toString('base64');
process.env.PII_SEARCH_HASH_KEY ??= Buffer.alloc(32, 2).toString('base64');
process.env.INTERNAL_HEADER_SECRET ??= 'test-internal-secret-at-least-32-chars-long';

import express from 'express';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import {
  createDocumentedRouter,
  errorHandler,
  TRUSTED_USER_ID_HEADER,
  TRUSTED_ROLES_HEADER,
  TRUSTED_GEOGRAPHY_UNIT_ID_HEADER,
  TRUSTED_SIGNATURE_HEADER,
  signInternalIdentity,
} from '@armman/service-commons';
import { registerBeneficiaryRoutes } from './beneficiary.routes';
import type { BeneficiaryService } from './beneficiary.service';
import { getAncestorChain } from '../geography/geography.client';

// requireGeographyScope calls the real getAncestorChain (a real fetch() to
// auth-service through the gateway) whenever the caller's own geography
// doesn't already match the target outright — mocked here so this suite
// tests only the middleware wiring/HTTP-status behavior, not a live network
// call to a gateway that isn't running in this test.
jest.mock('../geography/geography.client');
const getAncestorChainMock = jest.mocked(getAncestorChain);

/**
 * Integration coverage for GET /beneficiaries/:id's requireGeographyScope
 * wiring (code review follow-up: geography-scope guard built but not yet
 * applied to any route) — a real Express app + HTTP server, driven with
 * fetch(), so the actual
 * validate()/requireRoles()/trustGatewayIdentity()/requireGeographyScope()
 * middleware chain runs, not just the service call a unit test would mock
 * around.
 */
describe('beneficiary routes — GET /beneficiaries/:id geography scoping', () => {
  const service = {
    getById: jest.fn(),
    resolveVillageId: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryService>;

  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    const doc = createDocumentedRouter();
    registerBeneficiaryRoutes(doc, service);
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
    // Default: the target village's own ancestor chain is just itself — a
    // caller whose own geographyUnitId isn't exactly this id and isn't
    // resolvable to it must fail the scope check, matching a genuinely
    // unrelated geography branch.
    getAncestorChainMock.mockResolvedValue([{ geographyUnitId: targetVillageId }] as never);
  });

  /** Signed trusted-identity headers, matching what verifyAndForwardIdentity
   * sets on a real proxied request — trustGatewayIdentity rejects an
   * unsigned/mismatched header set. */
  function trustedHeaders(userId: string, roles: string, geographyUnitId: string) {
    const fields = { userId, roles, projectId: '', geographyUnitId };
    return {
      [TRUSTED_USER_ID_HEADER]: fields.userId,
      [TRUSTED_ROLES_HEADER]: fields.roles,
      [TRUSTED_GEOGRAPHY_UNIT_ID_HEADER]: fields.geographyUnitId,
      [TRUSTED_SIGNATURE_HEADER]: signInternalIdentity(
        fields,
        process.env.INTERNAL_HEADER_SECRET as string,
      ),
      authorization: 'Bearer test-token',
    };
  }

  const beneficiaryId = '11111111-1111-1111-1111-111111111111';
  const targetVillageId = 'village-1';

  it('as SAKHI whose own geographyUnitId matches the case villageId: 200', async () => {
    service.resolveVillageId.mockResolvedValue(targetVillageId);
    service.getById.mockResolvedValue({ id: beneficiaryId } as never);

    const res = await fetch(`${baseUrl}/beneficiaries/${beneficiaryId}`, {
      headers: trustedHeaders('sakhi-1', 'SAKHI', targetVillageId),
    });

    expect(res.status).toBe(200);
    expect(service.getById).toHaveBeenCalled();
  });

  it('as SAKHI whose own geographyUnitId is a DIFFERENT village with no ancestor relation: 403', async () => {
    service.resolveVillageId.mockResolvedValue(targetVillageId);

    const res = await fetch(`${baseUrl}/beneficiaries/${beneficiaryId}`, {
      headers: trustedHeaders('sakhi-1', 'SAKHI', 'some-other-village'),
    });

    expect(res.status).toBe(403);
    expect(service.getById).not.toHaveBeenCalled();
  });

  it('as SAKHI with no geographyUnitId of their own: 403 (fail-closed)', async () => {
    service.resolveVillageId.mockResolvedValue(targetVillageId);

    const res = await fetch(`${baseUrl}/beneficiaries/${beneficiaryId}`, {
      headers: trustedHeaders('sakhi-1', 'SAKHI', ''),
    });

    expect(res.status).toBe(403);
    expect(service.getById).not.toHaveBeenCalled();
  });

  it('as MANAGER, unrestricted regardless of geography: 200', async () => {
    service.resolveVillageId.mockResolvedValue(targetVillageId);
    service.getById.mockResolvedValue({ id: beneficiaryId } as never);

    const res = await fetch(`${baseUrl}/beneficiaries/${beneficiaryId}`, {
      headers: trustedHeaders('manager-1', 'MANAGER', ''),
    });

    expect(res.status).toBe(200);
    expect(service.resolveVillageId).not.toHaveBeenCalled();
  });

  it('as SYSTEM, unrestricted regardless of geography (server-to-server caller with no geography of its own): 200', async () => {
    service.resolveVillageId.mockResolvedValue(targetVillageId);
    service.getById.mockResolvedValue({ id: beneficiaryId } as never);

    const res = await fetch(`${baseUrl}/beneficiaries/${beneficiaryId}`, {
      headers: trustedHeaders('missed-visit-job', 'SYSTEM', ''),
    });

    expect(res.status).toBe(200);
    expect(service.resolveVillageId).not.toHaveBeenCalled();
  });
});
