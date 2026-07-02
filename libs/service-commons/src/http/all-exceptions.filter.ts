import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

import { type ApiFailure, ErrorCode } from './api-response';

const STATUS_TO_CODE: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHENTICATED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
};

/**
 * Converts any thrown error into the standard failure envelope.
 * Logs the full technical error server-side; never leaks internals to clients.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const errorCode = STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_ERROR;

    const clientMessage =
      status === HttpStatus.INTERNAL_SERVER_ERROR
        ? 'Something went wrong. Please try again.'
        : extractMessage(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        { requestId: request.header('x-request-id'), path: request.url, err: exception },
        'Unhandled server error',
      );
    }

    const body: ApiFailure = { success: false, message: clientMessage, errorCode };
    response.status(status).json(body);
  }
}

function extractMessage(exception: unknown): string {
  if (exception instanceof HttpException) {
    const res = exception.getResponse();
    if (typeof res === 'string') return res;
    if (typeof res === 'object' && res !== null && 'message' in res) {
      const message = (res as { message: unknown }).message;
      return Array.isArray(message) ? message.join('; ') : String(message);
    }
  }
  return 'Request failed.';
}
