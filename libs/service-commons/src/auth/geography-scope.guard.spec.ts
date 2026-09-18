import type { Request, Response } from 'express';
import { requireGeographyScope, type GeographyAncestor } from './geography-scope.guard';
import type { AuthenticatedUser } from './authenticate';

function mockReq(user?: AuthenticatedUser, headers: Record<string, string> = {}): Request {
  return {
    user,
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;
}

describe('requireGeographyScope', () => {
  const res = {} as Response;
  const targetId = 'village-1';
  const callerId = 'block-1';

  function chainOf(...ids: string[]): GeographyAncestor[] {
    return ids.map((geographyUnitId) => ({ geographyUnitId }));
  }

  it('rejects with 401 when req.user is undefined (authenticate did not run)', async () => {
    const resolveAncestorChain = jest.fn();
    const req = mockReq(undefined);
    const next = jest.fn();

    requireGeographyScope(resolveAncestorChain, () => targetId)(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(resolveAncestorChain).not.toHaveBeenCalled();
  });

  it('allows a MANAGER through unconditionally, without resolving any ancestor chain', async () => {
    const resolveAncestorChain = jest.fn();
    const req = mockReq({ id: 'u1', roles: ['MANAGER'], projectId: null, geographyUnitId: null });
    const next = jest.fn();

    requireGeographyScope(resolveAncestorChain, () => targetId)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(resolveAncestorChain).not.toHaveBeenCalled();
  });

  it('allows an ADMIN through unconditionally', async () => {
    const resolveAncestorChain = jest.fn();
    const req = mockReq({ id: 'u1', roles: ['ADMIN'], projectId: null, geographyUnitId: null });
    const next = jest.fn();

    requireGeographyScope(resolveAncestorChain, () => targetId)(req, res, next);

    expect(next).toHaveBeenCalledWith();
  });

  it('allows a SYSTEM caller through unconditionally, even with no geographyUnitId of its own', async () => {
    const resolveAncestorChain = jest.fn();
    const req = mockReq({
      id: 'system-caller',
      roles: ['SYSTEM'],
      projectId: null,
      geographyUnitId: null,
    });
    const next = jest.fn();

    requireGeographyScope(resolveAncestorChain, () => targetId)(req, res, next);

    expect(next).toHaveBeenCalledWith();
    expect(resolveAncestorChain).not.toHaveBeenCalled();
  });

  it('passes through unchecked when resolveTargetGeographyId returns null (route has nothing to scope)', async () => {
    const resolveAncestorChain = jest.fn();
    const req = mockReq({ id: 'u1', roles: ['SAKHI'], projectId: null, geographyUnitId: callerId });
    const next = jest.fn();

    requireGeographyScope(resolveAncestorChain, () => null)(req, res, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith();
    expect(resolveAncestorChain).not.toHaveBeenCalled();
  });

  it('denies a caller with no geographyUnitId of their own (fail-closed)', async () => {
    const resolveAncestorChain = jest.fn();
    const req = mockReq({ id: 'u1', roles: ['SAKHI'], projectId: null, geographyUnitId: null });
    const next = jest.fn();

    requireGeographyScope(resolveAncestorChain, () => targetId)(req, res, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(resolveAncestorChain).not.toHaveBeenCalled();
  });

  it('allows through without a lookup when the caller IS the target geography unit', async () => {
    const resolveAncestorChain = jest.fn();
    const req = mockReq({
      id: 'u1',
      roles: ['SAKHI'],
      projectId: null,
      geographyUnitId: targetId,
    });
    const next = jest.fn();

    requireGeographyScope(resolveAncestorChain, () => targetId)(req, res, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith();
    expect(resolveAncestorChain).not.toHaveBeenCalled();
  });

  it('supports an async resolveTargetGeographyId (e.g. a DB lookup for the target resource)', async () => {
    const resolveAncestorChain = jest
      .fn()
      .mockResolvedValue(chainOf(targetId, callerId, 'district-1', 'state-1'));
    const req = mockReq(
      { id: 'u1', roles: ['SUPERVISOR'], projectId: null, geographyUnitId: callerId },
      { authorization: 'Bearer test-token' },
    );
    const next = jest.fn();
    const asyncResolveTargetGeographyId = () => Promise.resolve(targetId);

    requireGeographyScope(resolveAncestorChain, asyncResolveTargetGeographyId)(req, res, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith();
  });

  it("allows through when the caller's unit is an ancestor of the target's chain", async () => {
    const resolveAncestorChain = jest
      .fn()
      .mockResolvedValue(chainOf(targetId, callerId, 'district-1', 'state-1'));
    const req = mockReq(
      { id: 'u1', roles: ['SUPERVISOR'], projectId: null, geographyUnitId: callerId },
      { authorization: 'Bearer test-token' },
    );
    const next = jest.fn();

    requireGeographyScope(resolveAncestorChain, () => targetId)(req, res, next);
    await new Promise(process.nextTick);

    expect(resolveAncestorChain).toHaveBeenCalledWith(targetId, 'Bearer test-token');
    expect(next).toHaveBeenCalledWith();
  });

  it("rejects with 403 when the caller's unit is not in the target's ancestor chain", async () => {
    const resolveAncestorChain = jest
      .fn()
      .mockResolvedValue(chainOf(targetId, 'some-other-block', 'district-1', 'state-1'));
    const req = mockReq(
      { id: 'u1', roles: ['SUPERVISOR'], projectId: null, geographyUnitId: callerId },
      { authorization: 'Bearer test-token' },
    );
    const next = jest.fn();

    requireGeographyScope(resolveAncestorChain, () => targetId)(req, res, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  });

  it('forwards a rejected ancestor-chain lookup to next() as an error', async () => {
    const lookupError = new Error('geography lookup failed');
    const resolveAncestorChain = jest.fn().mockRejectedValue(lookupError);
    const req = mockReq(
      { id: 'u1', roles: ['SUPERVISOR'], projectId: null, geographyUnitId: callerId },
      { authorization: 'Bearer test-token' },
    );
    const next = jest.fn();

    requireGeographyScope(resolveAncestorChain, () => targetId)(req, res, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith(lookupError);
  });
});
