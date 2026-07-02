import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import { createProxyMiddleware } from 'http-proxy-middleware';

import { SERVICE_ROUTES } from './routes';

/** Path prefix shared by the gateway and every downstream service. */
const API_PREFIX = '/api/v1';

/**
 * Registers a reverse proxy for each downstream service on the underlying
 * Express app, mounted BEFORE Nest's controllers/interceptors run.
 *
 * Why raw middleware (not a Nest controller): the proxied response must stream
 * through untouched. Routing it through a controller would re-wrap each body in
 * the success envelope (ResponseInterceptor) and double-process it. Mounting
 * here forwards bytes verbatim and keeps streaming (uploads/downloads) intact.
 *
 * The gateway reaches services only via the configured target URL — it never
 * imports service code, preserving the forklift / module-boundary rule.
 */
export function registerProxies(app: INestApplication): void {
  const logger = new Logger('Gateway.Proxy');

  for (const { prefix, target } of SERVICE_ROUTES) {
    const mountPath = `${API_PREFIX}${prefix}`;
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
            logger.error(`Proxy to ${target} failed: ${err.message}`);
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
    logger.log(`Routing ${mountPath}/* -> ${target}`);
  }
}
