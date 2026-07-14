import type { Request, Response } from 'express';
import { authenticate } from './authenticate';
import type { TokenSigner } from './token-signer';

function mockReq(headers: Record<string, string> = {}): Request {
  return { header: (name: string) => headers[name.toLowerCase()] } as unknown as Request;
}

describe('authenticate', () => {
  const signer = { sign: jest.fn(), verify: jest.fn() } as unknown as jest.Mocked<TokenSigner>;
  const res = {} as Response;

  beforeEach(() => jest.clearAllMocks());

  it('populates req.user and calls next() on a valid bearer token', async () => {
    signer.verify.mockResolvedValue({
      sub: 'user-1',
      roles: ['SUPERVISOR'],
      projectId: 'p1',
      geographyUnitId: 'g1',
    });
    const req = mockReq({ authorization: 'Bearer valid-token' });
    const next = jest.fn();

    authenticate(signer)(req, res, next);
    await new Promise(process.nextTick);

    expect(req.user).toEqual({
      id: 'user-1',
      roles: ['SUPERVISOR'],
      projectId: 'p1',
      geographyUnitId: 'g1',
    });
    expect(next).toHaveBeenCalledWith();
  });

  it('defaults roles/scope when the payload omits them', async () => {
    signer.verify.mockResolvedValue({ sub: 'user-1' });
    const req = mockReq({ authorization: 'Bearer valid-token' });
    const next = jest.fn();

    authenticate(signer)(req, res, next);
    await new Promise(process.nextTick);

    expect(req.user).toEqual({ id: 'user-1', roles: [], projectId: null, geographyUnitId: null });
  });

  it('rejects with 401 when the Authorization header is missing', () => {
    const req = mockReq();
    const next = jest.fn();

    authenticate(signer)(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(signer.verify).not.toHaveBeenCalled();
  });

  it('rejects with 401 when the header is not a Bearer token', () => {
    const req = mockReq({ authorization: 'Basic abc123' });
    const next = jest.fn();

    authenticate(signer)(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });

  it('rejects with 401 when the token fails verification (expired/tampered)', async () => {
    signer.verify.mockRejectedValue(new Error('signature verification failed'));
    const req = mockReq({ authorization: 'Bearer bad-token' });
    const next = jest.fn();

    authenticate(signer)(req, res, next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
  });
});
