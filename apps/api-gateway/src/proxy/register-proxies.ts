import type { Application } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';
import { errorHandler, type TokenSigner, verifyAndForwardIdentity } from '@armman/service-commons';

import { SERVICE_ROUTES } from './routes';

/** Path prefix shared by the gateway and every downstream service. */
const API_PREFIX = '/api/v1';

/**
 * Registers a reverse proxy for each downstream service on the Express app,
 * mounted BEFORE the gateway's own JSON body parsing / routes run.
 *
 * Why raw middleware (not a route handler that re-serializes the body): the
 * proxied response must stream through untouched. Routing it through a normal
 * handler would re-wrap each body in the success envelope and double-process
 * it. Mounting here forwards bytes verbatim and keeps streaming
 * (uploads/downloads) intact.
 *
 * The gateway reaches services only via the configured target URL — it never
 * imports service code, preserving the forklift / module-boundary rule.
 *
 * Auth (per the HLD §3.1 Step 2): every `requiresAuth` prefix runs
 * `verifyAndForwardIdentity` first — it verifies the bearer token once at the
 * edge and attaches the identity as trusted internal headers. Downstream
 * services read those headers via `trustGatewayIdentity` and still enforce
 * their own per-route `requireRoles(...)` — the gateway does not attempt a
 * full route-to-role map for a generic proxy layer.
 */
export function registerProxies(app: Application, signer: Pick<TokenSigner, 'verify'>): void {
  for (const { prefix, target, requiresAuth } of SERVICE_ROUTES) {
    const mountPath = `${API_PREFIX}${prefix}`;

    if (requiresAuth) {
      // Own error middleware right after the auth check (before express.json())
      // so a 401 here gets a proper JSON response instead of falling through
      // to the proxy with no body parser mounted yet.
      app.use(mountPath, verifyAndForwardIdentity(signer), errorHandler);
    }

    app.use(
      mountPath,
      createProxyMiddleware({
        target,
        changeOrigin: true,
        // The mount path strips the prefix, so rebuild the full downstream path
        // (services share the `api/v1` prefix and own the same path segment).
        pathRewrite: (path) => `${mountPath}${path}`,
        on: {
          proxyReq: (proxyReq, req) => {
            const requestId = req.headers['x-request-id'];
            if (typeof requestId === 'string') proxyReq.setHeader('X-Request-Id', requestId);
          },
          error: (err, _req, res) => {
            console.error(`Proxy to ${target} failed: ${err.message}`);
            if ('writeHead' in res && !res.headersSent) {
              res.writeHead(502, { 'Content-Type': 'application/json' });
            }
            if ('end' in res) {
              res.end(
                JSON.stringify({
                  success: false,
                  message: 'Upstream service is unavailable.',
                  errorCode: 'BAD_GATEWAY',
                }),
              );
            }
          },
        },
      }),
    );
    console.log(`Routing ${mountPath}/* -> ${target}`);
  }
}
