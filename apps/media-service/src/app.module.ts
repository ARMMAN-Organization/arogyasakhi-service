import express, { type Application } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import {
  buildLoggerOptions,
  createSwaggerRouter,
  errorHandler,
  notFoundHandler,
  requestId,
} from '@armman/service-commons';
import { appConfig } from './config/app-config';
import { PrismaService } from './prisma/prisma.service';
import { createHealthRouter } from './health/health.controller';
import { createMediaAssetModule } from './media/mediaAsset.module';
import { buildMediaServiceOpenApiDocument } from './docs/openapi';

// Re-export shared HTTP helpers so feature routers can import from a single place.
export {
  asyncHandler,
  ok,
  fail,
  validateBody,
  requireRoles,
  createDocumentedRouter,
  HttpError,
  ErrorCode,
  type DocumentedRouter,
} from '@armman/service-commons';

/** Builds and wires the Express application (replaces NestFactory + AppModule). */
export function createApp(prisma: PrismaService): Application {
  const app = express();

  app.use(pinoHttp(buildLoggerOptions(appConfig.LOG_LEVEL)));
  app.use(helmet());
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

  const mediaAssetModule = createMediaAssetModule(prisma);

  // All routes live under the global `api/v1` prefix.
  const api = express.Router();
  api.use(createHealthRouter(prisma));
  // Built from mediaAssetModule.registry — every route registered via
  // createDocumentedRouter() above is already in the spec, so this can never
  // drift from what's actually mounted.
  api.use(createSwaggerRouter(buildMediaServiceOpenApiDocument(mediaAssetModule.registry)));
  api.use(mediaAssetModule.router);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
