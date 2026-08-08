import type { NextFunction, Request, Response } from 'express';

/** Headers every real client call needs — sent whenever the browser's own
 * preflight omits Access-Control-Request-Headers (some browsers skip it for
 * requests that carry no non-simple headers other than the ones listed
 * here), so a preflight for an authenticated JSON request never fails open
 * with a missing Allow-Headers response. */
const DEFAULT_ALLOWED_HEADERS = 'Content-Type,Authorization,x-request-id';

const DEFAULT_ALLOWED_METHODS = 'GET,POST,PATCH,PUT,DELETE,OPTIONS';

/**
 * Builds the gateway's CORS middleware. Only ever allows an origin present
 * in `corsOrigins` — every other origin gets no Access-Control-Allow-Origin
 * header at all, so the browser enforces same-origin as normal.
 *
 * On an OPTIONS preflight, echoes back what the browser actually asked for
 * (Access-Control-Request-Method/-Headers) rather than a fixed list — a
 * non-simple request (JSON body, custom headers like x-request-id) is
 * otherwise blocked client-side even though the real request would have
 * succeeded. Falls back to DEFAULT_ALLOWED_METHODS/HEADERS when the browser
 * didn't send its own request-method/request-headers value, since every
 * real call through this gateway is an authenticated JSON request that
 * needs at least Authorization/Content-Type allowed.
 */
export function buildCorsMiddleware(corsOrigins: readonly string[]) {
  return function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
    // Access-Control-Allow-Origin is echoed conditionally per request (it
    // varies by the Origin header), so any cache sitting in front of this
    // gateway (CDN, reverse proxy) must key on Origin too — otherwise a
    // response computed for one origin could be served to a different one.
    res.setHeader('Vary', 'Origin');

    const origin = req.header('origin');
    if (origin && corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') {
      // Same reasoning as above: Allow-Methods/-Headers are echoed from the
      // preflight's own Access-Control-Request-* headers, so a cache must
      // key on those too, not just Origin.
      res.setHeader(
        'Vary',
        'Origin, Access-Control-Request-Method, Access-Control-Request-Headers',
      );
      res.setHeader(
        'Access-Control-Allow-Methods',
        req.header('access-control-request-method') ?? DEFAULT_ALLOWED_METHODS,
      );
      res.setHeader(
        'Access-Control-Allow-Headers',
        req.header('access-control-request-headers') ?? DEFAULT_ALLOWED_HEADERS,
      );
      res.setHeader('Access-Control-Max-Age', '86400');
      res.sendStatus(204);
      return;
    }
    next();
  };
}
