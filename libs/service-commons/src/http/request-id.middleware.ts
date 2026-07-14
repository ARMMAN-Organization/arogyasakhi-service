import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/** Ensures every request carries an X-Request-Id for tracing across services. */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  const id = req.header('x-request-id') ?? randomUUID();
  req.headers['x-request-id'] = id;
  res.setHeader('x-request-id', id);
  next();
}
