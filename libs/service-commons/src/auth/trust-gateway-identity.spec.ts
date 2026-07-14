import type { Request, Response } from 'express';
import { trustGatewayIdentity } from './trust-gateway-identity';

function mockReq(headers: Record<string, string> = {}): Request {
  return { header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

describe('trustGatewayIdentity', () => {
  const res = {} as Response;

  it('populates req.user from the trusted gateway headers', () => {
    const req = mockReq({
      'x-armman-user-id': 'user-1',
      'x-armman-roles': 'SAKHI,SUPERVISOR',
      'x-armman-project-id': 'project-1',
      'x-armman-geography-unit-id': 'geo-1',
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

  it('defaults roles/scope when those headers are absent', () => {
    const req = mockReq({ 'x-armman-user-id': 'user-1' });
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
});
