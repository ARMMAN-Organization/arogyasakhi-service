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
import { registerProxies } from './proxy/register-proxies';

export {
  asyncHandler,
  ok,
  fail,
  validateBody,
  requireRoles,
  HttpError,
  ErrorCode,
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
  app.use((req, res, next) => {
    const origin = req.header('origin');
    if (origin && appConfig.CORS_ORIGINS.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    if (req.method === 'OPTIONS') {
      res.sendStatus(204);
      return;
    }
    next();
  });
  app.use(requestId);

  registerProxies(app, signer);

  const api = express.Router();
  // Aggregated Swagger docs are GET-only and public — mount before
  // express.json() (no body to parse) and before auth (docs need no token).
  api.use(createDocsRouter());
  api.use(express.json());
  api.use(createHealthRouter());
  api.use(createInfoRouter());
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
