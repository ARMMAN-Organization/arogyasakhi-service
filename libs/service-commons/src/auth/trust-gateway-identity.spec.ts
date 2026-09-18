import type { Request, Response } from 'express';

const SECRET = 'test-internal-secret-at-least-32-chars-long';

function mockReq(headers: Record<string, string> = {}): Request {
  return { header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

/** `trust-gateway-identity.ts` reads INTERNAL_HEADER_SECRET from
 * process.env once at module load, so it must be set before the module is
 * (re-)imported — jest.resetModules() + a fresh require() per describe
 * block, rather than mutating process.env after the fact. */
function loadModuleWithSecret(secret: string | undefined) {
  jest.resetModules();
  if (secret === undefined) delete process.env.INTERNAL_HEADER_SECRET;
  else process.env.INTERNAL_HEADER_SECRET = secret;
  return require('./trust-gateway-identity') as typeof import('./trust-gateway-identity');
}

describe('trustGatewayIdentity', () => {
  const res = {} as Response;
  const originalSecret = process.env.INTERNAL_HEADER_SECRET;

  afterAll(() => {
    if (originalSecret === undefined) delete process.env.INTERNAL_HEADER_SECRET;
    else process.env.INTERNAL_HEADER_SECRET = originalSecret;
  });

  describe('with INTERNAL_HEADER_SECRET configured', () => {
    let trustGatewayIdentity: (typeof import('./trust-gateway-identity'))['trustGatewayIdentity'];
    let signInternalIdentity: (typeof import('./internal-identity-signature'))['signInternalIdentity'];

    beforeEach(() => {
      ({ trustGatewayIdentity } = loadModuleWithSecret(SECRET));
      ({ signInternalIdentity } = require('./internal-identity-signature'));
    });

    it('populates req.user from the trusted gateway headers when the signature verifies', () => {
      const fields = {
        userId: 'user-1',
        roles: 'SAKHI,SUPERVISOR',
        projectId: 'project-1',
        geographyUnitId: 'geo-1',
      };
      const req = mockReq({
        'x-armman-user-id': fields.userId,
        'x-armman-roles': fields.roles,
        'x-armman-project-id': fields.projectId,
        'x-armman-geography-unit-id': fields.geographyUnitId,
        'x-armman-identity-signature': signInternalIdentity(fields, SECRET),
      });
      const next = jest.fn();

      trustGatewayIdentity(req, res, next);

      expect(req.user).toEqual({
        id: 'user-1',
        roles: ['SAKHI', 'SUPERVISOR'],
        projectId: 'project-1',
        geographyUnitId: 'geo-1',
      });
      expect(next).toHaveBeenCalledWith();
    });

    it('defaults roles/scope when those headers are absent, still requiring a valid signature over the empty values', () => {
      const fields = { userId: 'user-1', roles: '', projectId: '', geographyUnitId: '' };
      const req = mockReq({
        'x-armman-user-id': fields.userId,
        'x-armman-identity-signature': signInternalIdentity(fields, SECRET),
      });
      const next = jest.fn();

      trustGatewayIdentity(req, res, next);

      expect(req.user).toEqual({ id: 'user-1', roles: [], projectId: null, geographyUnitId: null });
    });

    it('rejects with 401 when the trusted user-id header is missing', () => {
      const req = mockReq();
      const next = jest.fn();

      trustGatewayIdentity(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
      expect(req.user).toBeUndefined();
    });

    it('rejects with 401 when the signature header is missing', () => {
      const req = mockReq({ 'x-armman-user-id': 'user-1' });
      const next = jest.fn();

      trustGatewayIdentity(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
      expect(req.user).toBeUndefined();
    });

    it('rejects with 401 when the signature does not match the headers (forged/tampered)', () => {
      const signedFields = { userId: 'user-1', roles: 'SAKHI', projectId: '', geographyUnitId: '' };
      // Signature computed over roles: 'SAKHI', but the request presents
      // roles: 'ADMIN' — simulating a caller who forged/edited the header
      // after a genuine signature was issued for a lower-privileged role.
      const tamperedReq = mockReq({
        'x-armman-user-id': signedFields.userId,
        'x-armman-roles': 'ADMIN',
        'x-armman-identity-signature': signInternalIdentity(signedFields, SECRET),
      });
      const next = jest.fn();

      trustGatewayIdentity(tamperedReq, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
      expect(tamperedReq.user).toBeUndefined();
    });

    it('rejects with 401 when the signature was produced with a different secret', () => {
      const fields = { userId: 'user-1', roles: 'SAKHI', projectId: '', geographyUnitId: '' };
      const req = mockReq({
        'x-armman-user-id': fields.userId,
        'x-armman-roles': fields.roles,
        'x-armman-identity-signature': signInternalIdentity(
          fields,
          'a-completely-different-secret',
        ),
      });
      const next = jest.fn();

      trustGatewayIdentity(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    });
  });

  describe('with INTERNAL_HEADER_SECRET unset (misconfiguration)', () => {
    it('fails closed — rejects every request with 401 rather than trusting unsigned headers', () => {
      const { trustGatewayIdentity } = loadModuleWithSecret(undefined);
      const req = mockReq({ 'x-armman-user-id': 'user-1' });
      const next = jest.fn();

      trustGatewayIdentity(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
      expect(req.user).toBeUndefined();
    });
  });
});
