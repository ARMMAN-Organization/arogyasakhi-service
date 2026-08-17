import express, { type Application } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type Redis from 'ioredis';
import {
  buildLoggerOptions,
  createAuthRateLimiter,
  createSwaggerRouter,
  errorHandler,
  notFoundHandler,
  requestId,
  type TokenSigner,
} from '@armman/service-commons';
import { appConfig } from './config/app-config';
import { PrismaService } from './prisma/prisma.service';
import { createHealthRouter } from './health/health.controller';
import { createAuthModule } from './auth/auth.module';
import { createProjectModule } from './projects/project.module';
import { createLookupModule } from './lookups/lookup.module';
import { createGeographyModule } from './geography/geography.module';
import { createMasterDataModule } from './master-data/master-data.module';
import { createSakhiModule } from './sakhis/sakhi.module';
import { createProjectGeographyModule } from './project-geography/project-geography.module';
import { createApplicationParameterModule } from './application-parameters/application-parameter.module';
import { buildAuthServiceOpenApiDocument } from './docs/openapi';

// Re-export shared HTTP helpers so feature routers can import from a single place.
export {
  asyncHandler,
  ok,
  fail,
  validate,
  validateBody,
  requireRoles,
  authenticate,
  unauthorized,
  createDocumentedRouter,
  errorResponse,
  HttpError,
  ErrorCode,
  type DocumentedRouter,
} from '@armman/service-commons';

/** Builds and wires the Express application (replaces NestFactory + AppModule). */
export function createApp(prisma: PrismaService, signer: TokenSigner, redis: Redis): Application {
  const app = express();

  app.use(pinoHttp(buildLoggerOptions(appConfig.LOG_LEVEL)));
  // Swagger UI's HTML injects inline <script>/<style> tags, so the default CSP
  // (which forbids 'unsafe-inline') is relaxed only for the /docs path below.
  // Built once (not per-request) — helmet's own docs warn against
  // constructing new middleware instances inside a request handler.
  const defaultHelmet = helmet();
  const docsHelmet = helmet({
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:'],
      },
    },
  });
  app.use((req, res, next) => {
    if (req.path === '/api/v1/docs' || req.path.startsWith('/api/v1/docs/')) {
      return docsHelmet(req, res, next);
    }
    return defaultHelmet(req, res, next);
  });
  app.use(express.json());
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

  const authModule = createAuthModule(prisma, signer, appConfig.JWT_ADMIN_ACCESS_TOKEN_TTL);
  const projectModule = createProjectModule(prisma, signer);
  const lookupModule = createLookupModule(prisma, signer);
  const geographyModule = createGeographyModule(prisma, signer);
  const masterDataModule = createMasterDataModule(prisma, signer);
  const sakhiModule = createSakhiModule(prisma, signer);
  const projectGeographyModule = createProjectGeographyModule(prisma, signer);
  const applicationParameterModule = createApplicationParameterModule(prisma, signer);

  // All routes live under the global `api/v1` prefix.
  const api = express.Router();
  api.use(createHealthRouter(prisma));
  // Built from every feature module's registry — every route registered via
  // createDocumentedRouter() above is already in the spec, so this can never
  // drift from what's actually mounted.
  api.use(
    createSwaggerRouter(
      buildAuthServiceOpenApiDocument(
        authModule.registry,
        projectModule.registry,
        lookupModule.registry,
        geographyModule.registry,
        masterDataModule.registry,
        sakhiModule.registry,
        projectGeographyModule.registry,
        applicationParameterModule.registry,
      ),
    ),
  );
  // Rate limit applies to every /auth/* route per the HLD (100 req/min/IP).
  api.use('/auth', createAuthRateLimiter(redis));
  api.use(authModule.router);
  api.use(projectModule.router);
  api.use(lookupModule.router);
  api.use(geographyModule.router);
  api.use(masterDataModule.router);
  api.use(sakhiModule.router);
  api.use(projectGeographyModule.router);
  api.use(applicationParameterModule.router);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
