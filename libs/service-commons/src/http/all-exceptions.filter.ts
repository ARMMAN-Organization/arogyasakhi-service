import type { NextFunction, Request, Response } from 'express';
import { type ApiFailure, ErrorCode, fail } from './api-response';
import { HttpError } from './http-error';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
};

/** 404 handler for unmatched routes; returns the standard failure envelope. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json(fail('Not found.', ErrorCode.NOT_FOUND));
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
  const clientMessage =
    status >= 500
      ? 'Something went wrong. Please try again.'
      : err instanceof Error
        ? err.message
        : 'Request failed.';

  if (status >= 500) {
    req.log?.error({ requestId: req.header('x-request-id'), path: req.url, err }, 'Unhandled server error');
  }

  const details = err instanceof HttpError ? err.details : undefined;
  const body: ApiFailure = fail(clientMessage, errorCode, details);
  res.status(status).json(body);
}
