import type { Params } from 'nestjs-pino';

/**
 * Pino logger options for all services. Emits structured JSON, attaches the
 * request id, and redacts sensitive fields so PII/tokens are never logged.
 */
export function buildLoggerOptions(level: string): Params {
  return {
    pinoHttp: {
      level,
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
    },
  };
}
