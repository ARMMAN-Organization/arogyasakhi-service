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
import { createNotificationModule } from './notifications/notification.module';
import { createEscalationModule } from './escalations/escalation.module';
import { createEscalationsBySakhiModule } from './escalations-by-sakhi/escalations-by-sakhi.module';
import { buildNotificationEscalationServiceOpenApiDocument } from './docs/openapi';

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
  const notificationModule = createNotificationModule(prisma);
  const escalationModule = createEscalationModule(prisma);
  const escalationsBySakhiModule = createEscalationsBySakhiModule(prisma);

  const api = express.Router();
  api.use(createHealthRouter(prisma));
  // Built from every feature module's registry — every route registered via
  // createDocumentedRouter() above is already in the spec, so this can never
  // drift from what's actually mounted.
  api.use(
    createSwaggerRouter(
      buildNotificationEscalationServiceOpenApiDocument(
        notificationModule.registry,
        escalationModule.registry,
        escalationsBySakhiModule.registry,
      ),
    ),
  );
  api.use(notificationModule.router);
  api.use(escalationModule.router);
  api.use(escalationsBySakhiModule.router);
  app.use('/api/v1', api);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
