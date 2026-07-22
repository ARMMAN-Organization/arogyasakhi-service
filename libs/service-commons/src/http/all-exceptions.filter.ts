import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { type ApiFailure, ErrorCode, fail } from './api-response';
import { HttpError } from './http-error';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  422: ErrorCode.UNPROCESSABLE,
};

/** Correlation id for the response body; falls back to a fresh uuid if the
 * request-id middleware did not run (it always should). */
function traceIdOf(req: Request): string {
  return req.header('x-request-id') ?? randomUUID();
}

/** 404 handler for unmatched routes; returns the standard failure envelope. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json(fail('Not found.', ErrorCode.NOT_FOUND, traceIdOf(req)));
}

/**
 * Express error middleware. Converts any thrown error into the standard failure
 * envelope. Logs the full technical error server-side (5xx); never leaks
 * internals to clients. Must be registered last, with its 4-arg signature.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Express detects error middleware by its 4-arg arity
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  const status = err instanceof HttpError ? err.status : 500;
  const errorCode = STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR;
  const traceId = traceIdOf(req);
  const clientMessage =
    status >= 500
      ? 'Something went wrong. Please try again.'
      : err instanceof Error
        ? err.message
        : 'Request failed.';

  if (status >= 500) {
    req.log?.error({ requestId: traceId, path: req.url, err }, 'Unhandled server error');
  }

  // Field-level errors only come from our own HttpError.details — never from a
  // raw 5xx — so internals can never leak into fieldErrors.
  const fieldErrors = err instanceof HttpError ? err.details : undefined;
  const body: ApiFailure = fail(clientMessage, errorCode, traceId, fieldErrors);
  res.status(status).json(body);
}
