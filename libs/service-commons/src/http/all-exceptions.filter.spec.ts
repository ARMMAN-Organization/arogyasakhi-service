import type { NextFunction, Request, Response } from 'express';
import { errorHandler } from './all-exceptions.filter';
import { ErrorCode } from './api-response';
import { HttpError } from './http-error';

function mockReq(): Request {
  return { header: () => 'trace-1', url: '/api/v1/thing', log: { error: jest.fn() } } as never;
}

function mockRes() {
  const res = {
    statusCode: 0,
    body: undefined as unknown,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res as typeof res & Response;
}

describe('errorHandler', () => {
  const next: NextFunction = jest.fn();

  it('masks a 500 message — internals must never reach the client', () => {
    const res = mockRes();
    errorHandler(new Error('connect ECONNREFUSED 10.0.0.1:5432'), mockReq(), res, next);

    expect(res.statusCode).toBe(500);
    expect(res.body).toMatchObject({
      success: false,
      message: 'Something went wrong. Please try again.',
      errorCode: ErrorCode.INTERNAL_ERROR,
    });
  });

  it('masks a 502 message too — an upstream error may carry internals', () => {
    const res = mockRes();
    errorHandler(
      new HttpError(502, 'upstream said: password authentication failed'),
      mockReq(),
      res,
      next,
    );

    expect(res.statusCode).toBe(502);
    expect(res.body).toMatchObject({ message: 'Something went wrong. Please try again.' });
  });

  it('passes a 501 message through verbatim — it states the API contract, not internals', () => {
    const res = mockRes();
    errorHandler(
      new HttpError(501, 'Data restore decisions are not yet available — pending confirmation.'),
      mockReq(),
      res,
      next,
    );

    expect(res.statusCode).toBe(501);
    expect(res.body).toMatchObject({
      message: 'Data restore decisions are not yet available — pending confirmation.',
      errorCode: ErrorCode.NOT_IMPLEMENTED,
    });
  });

  it('does not log a 501 as an unhandled server error', () => {
    const req = mockReq();
    errorHandler(new HttpError(501, 'Not built yet.'), req, mockRes(), next);
    expect(req.log?.error).not.toHaveBeenCalled();
  });

  it('still logs a genuine 500 as an unhandled server error', () => {
    const req = mockReq();
    errorHandler(new Error('boom'), req, mockRes(), next);
    expect(req.log?.error).toHaveBeenCalled();
  });

  it('passes 4xx messages through, as before', () => {
    const res = mockRes();
    errorHandler(
      new HttpError(409, 'This reopen request has already been decided.'),
      mockReq(),
      res,
      next,
    );

    expect(res.statusCode).toBe(409);
    expect(res.body).toMatchObject({
      message: 'This reopen request has already been decided.',
      errorCode: ErrorCode.CONFLICT,
    });
  });
});
