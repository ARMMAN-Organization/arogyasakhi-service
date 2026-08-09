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
import { createReferralModule } from './referrals/referral.module';
import { createRiskAssessmentModule } from './risk-assessments/riskAssessment.module';
import { createRiskConditionModule } from './risk-conditions/riskCondition.module';
import { buildRiskReferralServiceOpenApiDocument } from './docs/openapi';

// Re-export shared HTTP helpers so feature routers can import from a single place.
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

  const referralModule = createReferralModule(prisma);
  const riskAssessmentModule = createRiskAssessmentModule(prisma);
  const riskConditionModule = createRiskConditionModule(prisma);

  // All routes live under the global `api/v1` prefix.
  const api = express.Router();
  api.use(createHealthRouter(prisma));
  // Built from every feature module's registry — every route registered via
  // createDocumentedRouter() above is already in the spec, so this can never
  // drift from what's actually mounted.
  api.use(
    createSwaggerRouter(
      buildRiskReferralServiceOpenApiDocument(
        referralModule.registry,
        riskAssessmentModule.registry,
        riskConditionModule.registry,
      ),
    ),
  );
  api.use(referralModule.router);
  api.use(riskAssessmentModule.router);
  api.use(riskConditionModule.router);
  app.use('/api/v1', api);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
