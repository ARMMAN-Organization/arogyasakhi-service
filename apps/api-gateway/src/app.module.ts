import express, { type Application } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import {
  buildLoggerOptions,
  errorHandler,
  notFoundHandler,
  requestId,
  type TokenSigner,
} from '@armman/service-commons';
import { appConfig } from './config/app-config';
import { createHealthRouter } from './health/health.controller';
import { createInfoRouter } from './info/info.controller';
import { createDocsRouter } from './docs/docs.controller';
import { createDashboardRouter } from './dashboard/dashboard.controller';
import { createPadasRouter } from './padas/padas.controller';
import { createPadaVisitsRouter } from './padas/pada-visits.controller';
import { registerProxies } from './proxy/register-proxies';
import { buildCorsMiddleware } from './cors/cors-middleware';

export {
  asyncHandler,
  ok,
  fail,
  forbidden,
  notFound,
  unauthorized,
  validateBody,
  requireRoles,
  HttpError,
  ErrorCode,
  type AuthenticatedUser,
  type TokenSigner,
} from '@armman/service-commons';

/**
 * Builds and wires the gateway's Express application.
 *
 * Ordering matters: pino-http/helmet/CORS/request-id apply to ALL traffic
 * (including proxied requests) so every hop is logged, secured, and traceable.
 * Downstream proxies are registered BEFORE `express.json()` and the gateway's
 * own routes, so proxied bodies stream through untouched — they are never
 * JSON-parsed or wrapped in the success envelope. Only the gateway's own
 * info/health routes go through that pipeline.
 */
export function createApp(signer: Pick<TokenSigner, 'verify'>): Application {
  const app = express();

  app.use(pinoHttp(buildLoggerOptions(appConfig.LOG_LEVEL)));
  app.use(helmet());
  app.use(buildCorsMiddleware(appConfig.CORS_ORIGINS));
  app.use(requestId);

  registerProxies(app, signer);

  const api = express.Router();
  // Aggregated Swagger docs are GET-only and public — mount before
  // express.json() (no body to parse) and before auth (docs need no token).
  api.use(createDocsRouter());
  api.use(express.json());
  api.use(createHealthRouter());
  api.use(createInfoRouter());
  // BFF-style aggregation route (fans out to 4 services, merges results) —
  // not a proxy mount, so it lives after express.json()/before the proxy
  // registrations would matter (it owns its own path, no prefix collision
  // with SERVICE_ROUTES).
  api.use(createDashboardRouter(signer));
  api.use(createPadasRouter(signer));
  api.use(createPadaVisitsRouter(signer));
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
