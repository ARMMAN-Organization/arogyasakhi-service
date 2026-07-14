import express, { type Application } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import type Redis from 'ioredis';
import {
  buildLoggerOptions,
  createAuthRateLimiter,
  errorHandler,
  notFoundHandler,
  requestId,
  type TokenSigner,
} from '@armman/service-commons';
import { appConfig } from './config/app-config';
import { PrismaService } from './prisma/prisma.service';
import { createHealthRouter } from './health/health.controller';
import { createAuthModule } from './auth/auth.module';

// Re-export shared HTTP helpers so feature routers can import from a single place.
export {
  asyncHandler,
  ok,
  fail,
  validateBody,
  requireRoles,
  authenticate,
  unauthorized,
  HttpError,
  ErrorCode,
} from '@armman/service-commons';

/** Builds and wires the Express application (replaces NestFactory + AppModule). */
export function createApp(prisma: PrismaService, signer: TokenSigner, redis: Redis): Application {
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

  // All routes live under the global `api/v1` prefix.
  const api = express.Router();
  api.use(createHealthRouter(prisma));
  // Rate limit applies to every /auth/* route per the HLD (100 req/min/IP).
  api.use('/auth', createAuthRateLimiter(redis));
  api.use(
    createAuthModule(
      prisma,
      signer,
      appConfig.JWT_ACCESS_TOKEN_TTL,
      appConfig.JWT_REFRESH_TOKEN_TTL,
    ),
  );
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
