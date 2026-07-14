import type { Request, Response } from 'express';
import { verifyAndForwardIdentity } from './forward-trusted-identity';
import type { TokenSigner } from './token-signer';

function mockReq(headers: Record<string, string> = {}): Request {
  return {
    header: (name: string) => headers[name.toLowerCase()],
    headers: {},
  } as unknown as Request;
}

describe('verifyAndForwardIdentity', () => {
  const signer = { sign: jest.fn(), verify: jest.fn() } as unknown as jest.Mocked<TokenSigner>;
  const res = {} as Response;

  beforeEach(() => jest.clearAllMocks());

  it('verifies the token and sets trusted identity headers on the outgoing request', async () => {
    signer.verify.mockResolvedValue({
      sub: 'user-1',
      roles: ['MANAGER'],
      projectId: 'p1',
      geographyUnitId: 'g1',
    });
    const req = mockReq({ authorization: 'Bearer valid-token' });
    const next = jest.fn();

    verifyAndForwardIdentity(signer)(req, res, next);
    await new Promise(process.nextTick);

    expect(req.headers['x-armman-user-id']).toBe('user-1');
    expect(req.headers['x-armman-roles']).toBe('MANAGER');
    expect(req.headers['x-armman-project-id']).toBe('p1');
    expect(req.headers['x-armman-geography-unit-id']).toBe('g1');
    expect(next).toHaveBeenCalledWith();
  });

  it('rejects with 401 when no Authorization header is present', () => {
    const req = mockReq();
    const next = jest.fn();

    verifyAndForwardIdentity(signer)(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(signer.verify).not.toHaveBeenCalled();
  });

  it('rejects with 401 when token verification fails', async () => {
    signer.verify.mockRejectedValue(new Error('expired'));
    const req = mockReq({ authorization: 'Bearer bad-token' });
    const next = jest.fn();

    verifyAndForwardIdentity(signer)(req, res, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });
});
