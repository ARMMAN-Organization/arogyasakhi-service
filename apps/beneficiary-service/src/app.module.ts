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
import { createBeneficiaryModule } from './beneficiary/beneficiary.module';
import { buildBeneficiaryServiceOpenApiDocument } from './docs/openapi';

export {
  asyncHandler,
  ok,
  fail,
  validate,
  validateBody,
  requireRoles,
  trustGatewayIdentity,
  unauthorized,
  createDocumentedRouter,
  HttpError,
  ErrorCode,
  type DocumentedRouter,
} from '@armman/service-commons';

/** Builds the Express application: security headers, logging, request-id, routes, error handling. */
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

  const beneficiaryModule = createBeneficiaryModule(prisma);

  const api = express.Router();
  api.use(createHealthRouter(prisma));
  // Built from beneficiaryModule.registry — every route registered via
  // createDocumentedRouter() above is already in the spec, so this can never
  // drift from what's actually mounted.
  api.use(createSwaggerRouter(buildBeneficiaryServiceOpenApiDocument(beneficiaryModule.registry)));
  api.use(beneficiaryModule.router);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
