import express, {
  type Application,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import helmet from 'helmet';
import { randomUUID } from 'node:crypto';
import { pinoHttp } from 'pino-http';
import type { ZodTypeAny, infer as ZodInfer } from 'zod';
import { appConfig } from './config/app-config';
import { PrismaService } from './prisma/prisma.service';
import { createHealthRouter } from './health/health.controller';
import { createSessionModule } from './sessions/session.module';

// --------------------------------------------------------------------------
// Response envelopes (framework-agnostic; ported from @armman/service-commons)
// --------------------------------------------------------------------------

/** Stable, machine-readable error codes the frontend can switch on. */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

export interface ApiSuccess<TData> {
  success: true;
  message: string;
  data: TData;
}

export interface ApiFailure {
  success: false;
  message: string;
  errorCode: ErrorCode;
  details?: Record<string, unknown>;
}

/** Wraps a value in the standard success envelope. */
export function ok<TData>(data: TData): ApiSuccess<TData> {
  return { success: true, message: 'OK', data };
}

/** Builds the standard failure envelope. */
export function fail(message: string, errorCode: ErrorCode, details?: Record<string, unknown>): ApiFailure {
  return details ? { success: false, message, errorCode, details } : { success: false, message, errorCode };
}

// --------------------------------------------------------------------------
// HTTP error (replaces Nest HttpException)
// --------------------------------------------------------------------------

/** Error carrying an HTTP status; thrown by handlers to signal a specific code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
};

// --------------------------------------------------------------------------
// Cross-cutting middleware (replaces service-commons Nest providers)
// --------------------------------------------------------------------------

/** Ensures every request carries an X-Request-Id for tracing across services. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = req.header('x-request-id') ?? randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('x-request-id', id);
  next();
}

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** Validates `req.body` against a Zod schema; 400 VALIDATION_ERROR on failure. */
export function validateBody<TSchema extends ZodTypeAny>(schema: TSchema): RequestHandler {
  return (req, _res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
      return next(new HttpError(400, message));
    }
    req.body = parsed.data as ZodInfer<TSchema>;
    next();
  };
}

interface AuthenticatedUser {
  id: string;
  roles: string[];
}

/**
 * Enforces role-based access at the server edge. Assumes an upstream auth guard
 * has populated `req.user`. Authorization is NEVER left to the client.
 */
export function requireRoles(...roles: string[]): RequestHandler {
  return (req, _res, next) => {
    if (roles.length === 0) return next();
    const user = (req as Request & { user?: AuthenticatedUser }).user;
    if (!user) return next(new HttpError(401, 'Authentication required.'));
    const allowed = user.roles.some((role) => roles.includes(role));
    if (!allowed) return next(new HttpError(403, 'You do not have access to this resource.'));
    next();
  };
}

/**
 * Converts any thrown error into the standard failure envelope. Logs the full
 * technical error server-side; never leaks internals to clients.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express identifies error middleware by its 4-arg signature
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const status = err instanceof HttpError ? err.status : 500;
  const errorCode = STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR;
  const clientMessage =
    status >= 500 ? 'Something went wrong. Please try again.' : err instanceof Error ? err.message : 'Request failed.';

  if (status >= 500) {
    req.log?.error({ requestId: req.header('x-request-id'), path: req.url, err }, 'Unhandled server error');
  }

  res.status(status).json(fail(clientMessage, errorCode));
}

// --------------------------------------------------------------------------
// Application factory (replaces NestFactory + AppModule)
// --------------------------------------------------------------------------

/** Builds and wires the Express application. */
export function createApp(prisma: PrismaService): Application {
  const app = express();

  app.use(
    pinoHttp({
      level: appConfig.LOG_LEVEL,
      autoLogging: true,
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.password',
          'req.body.token',
          '*.pii',
        ],
        remove: true,
      },
      customProps: (req) => ({ requestId: req.headers['x-request-id'] }),
    }),
  );
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
  api.use(createSessionModule(prisma));
  app.use('/api/v1', api);

  app.use((_req, res) => {
    res.status(404).json(fail('Not found.', ErrorCode.NOT_FOUND));
  });
  app.use(errorHandler);

  return app;
}
