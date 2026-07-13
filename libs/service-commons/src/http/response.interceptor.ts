import type { Response } from 'express';
import { ok } from './api-response';

/**
 * Sends a value wrapped in the standard success envelope. Replaces the former
 * NestJS ResponseInterceptor — handlers now call this explicitly instead of
 * returning bare data.
 */
export function sendOk<TData>(res: Response, data: TData, status = 200): void {
  res.status(status).json(ok(data));
}
