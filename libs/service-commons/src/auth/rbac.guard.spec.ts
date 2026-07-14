import type { Request, Response } from 'express';
import { requireRoles } from './rbac.guard';
import type { AuthenticatedUser } from './authenticate';

function mockReq(user?: AuthenticatedUser): Request {
  return { user } as unknown as Request;
}

describe('requireRoles', () => {
  const res = {} as Response;

  it('calls next() when req.user has an allowed role', () => {
    const req = mockReq({ id: 'u1', roles: ['SAKHI'], projectId: null, geographyUnitId: null });
    const next = jest.fn();

    requireRoles('SAKHI', 'SUPERVISOR')(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with 403 when req.user has none of the allowed roles', () => {
    const req = mockReq({ id: 'u1', roles: ['SAKHI'], projectId: null, geographyUnitId: null });
    const next = jest.fn();

    requireRoles('ADMIN')(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('rejects with 401 when req.user is undefined (authenticate did not run)', () => {
    const req = mockReq(undefined);
    const next = jest.fn();

    requireRoles('ADMIN')(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('allows any authenticated user through when called with zero roles', () => {
    const req = mockReq({ id: 'u1', roles: ['SAKHI'], projectId: null, geographyUnitId: null });
    const next = jest.fn();

    requireRoles()(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });
});
