import { buildCorsMiddleware } from './cors-middleware';

const ALLOWED_ORIGIN = 'http://localhost:5173';

function mockReq(overrides: Record<string, string | undefined> = {}, method = 'GET') {
  const headers = overrides;
  return {
    method,
    header: (name: string) => headers[name.toLowerCase()],
  } as never;
}

function mockRes() {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((name: string, value: string) => {
      headers[name] = value;
    }),
    sendStatus: jest.fn(),
    headers,
  } as unknown as { setHeader: jest.Mock; sendStatus: jest.Mock; headers: Record<string, string> };
}

describe('buildCorsMiddleware', () => {
  it('allows an origin present in corsOrigins', () => {
    const middleware = buildCorsMiddleware([ALLOWED_ORIGIN]);
    const req = mockReq({ origin: ALLOWED_ORIGIN });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res as never, next);

    expect(res.headers['Access-Control-Allow-Origin']).toBe(ALLOWED_ORIGIN);
    expect(res.headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(next).toHaveBeenCalled();
  });

  it('sets no Allow-Origin header for an origin not in corsOrigins', () => {
    const middleware = buildCorsMiddleware([ALLOWED_ORIGIN]);
    const req = mockReq({ origin: 'https://evil.example.com' });
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res as never, next);

    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('calls next() and skips CORS headers entirely when no Origin header is present', () => {
    const middleware = buildCorsMiddleware([ALLOWED_ORIGIN]);
    const req = mockReq({});
    const res = mockRes();
    const next = jest.fn();

    middleware(req, res as never, next);

    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it('sets Vary: Origin on every response, since Allow-Origin is echoed conditionally per request', () => {
    const middleware = buildCorsMiddleware([ALLOWED_ORIGIN]);
    const req = mockReq({ origin: ALLOWED_ORIGIN });
    const res = mockRes();

    middleware(req, res as never, jest.fn());

    expect(res.headers['Vary']).toBe('Origin');
  });

  describe('OPTIONS preflight', () => {
    it('echoes back the browser-requested method and headers', () => {
      const middleware = buildCorsMiddleware([ALLOWED_ORIGIN]);
      const req = mockReq(
        {
          origin: ALLOWED_ORIGIN,
          'access-control-request-method': 'PATCH',
          'access-control-request-headers': 'content-type,x-request-id',
        },
        'OPTIONS',
      );
      const res = mockRes();
      const next = jest.fn();

      middleware(req, res as never, next);

      expect(res.headers['Access-Control-Allow-Methods']).toBe('PATCH');
      expect(res.headers['Access-Control-Allow-Headers']).toBe('content-type,x-request-id');
      expect(res.headers['Access-Control-Max-Age']).toBe('86400');
      expect(res.sendStatus).toHaveBeenCalledWith(204);
      expect(next).not.toHaveBeenCalled();
    });

    it('falls back to the default methods list when the browser sends no Access-Control-Request-Method', () => {
      const middleware = buildCorsMiddleware([ALLOWED_ORIGIN]);
      const req = mockReq({ origin: ALLOWED_ORIGIN }, 'OPTIONS');
      const res = mockRes();

      middleware(req, res as never, jest.fn());

      expect(res.headers['Access-Control-Allow-Methods']).toBe('GET,POST,PATCH,PUT,DELETE,OPTIONS');
    });

    it('falls back to a default header list (including Authorization) when the browser sends no Access-Control-Request-Headers', () => {
      const middleware = buildCorsMiddleware([ALLOWED_ORIGIN]);
      const req = mockReq({ origin: ALLOWED_ORIGIN }, 'OPTIONS');
      const res = mockRes();

      middleware(req, res as never, jest.fn());

      expect(res.headers['Access-Control-Allow-Headers']).toBe(
        'Content-Type,Authorization,x-request-id',
      );
    });

    it('still responds 204 to a preflight from a disallowed origin, but without Allow-Origin', () => {
      const middleware = buildCorsMiddleware([ALLOWED_ORIGIN]);
      const req = mockReq({ origin: 'https://evil.example.com' }, 'OPTIONS');
      const res = mockRes();

      middleware(req, res as never, jest.fn());

      expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined();
      expect(res.sendStatus).toHaveBeenCalledWith(204);
    });

    it('sets Vary to include the preflight request headers, so a cache keys on them too', () => {
      const middleware = buildCorsMiddleware([ALLOWED_ORIGIN]);
      const req = mockReq(
        { origin: ALLOWED_ORIGIN, 'access-control-request-method': 'PATCH' },
        'OPTIONS',
      );
      const res = mockRes();

      middleware(req, res as never, jest.fn());

      expect(res.headers['Vary']).toBe(
        'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
      );
    });
  });
});
