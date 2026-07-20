import { errorResponse } from './error-responses';
import { ErrorCode } from '../http/api-response';

/** Pulls the resolved example object off the Zod schema's OpenAPI metadata. */
function exampleOf(schema: ReturnType<typeof errorResponse>['schema']) {
  // zod-to-openapi stores metadata under _def.openapi.metadata
  const meta = (schema as unknown as { _def: { openapi?: { metadata?: { example?: unknown } } } })
    ._def.openapi?.metadata?.example;
  return meta as
    | {
        success: boolean;
        message: string;
        errorCode: string;
        traceId: string;
        fieldErrors?: Record<string, unknown>;
      }
    | undefined;
}

describe('errorResponse', () => {
  describe('errorCode per HTTP status (matches STATUS_TO_CODE in the error filter)', () => {
    const cases: Array<[number, ErrorCode]> = [
      [400, ErrorCode.VALIDATION_ERROR],
      [401, ErrorCode.UNAUTHENTICATED],
      [403, ErrorCode.FORBIDDEN],
      [404, ErrorCode.NOT_FOUND],
      [409, ErrorCode.CONFLICT],
      [422, ErrorCode.UNPROCESSABLE],
      [500, ErrorCode.INTERNAL_ERROR],
    ];

    it.each(cases)('status %i -> errorCode %s', (status, expected) => {
      const { schema } = errorResponse(status);
      expect(exampleOf(schema)?.errorCode).toBe(expected);
    });
  });

  it('422 maps to UNPROCESSABLE (aligned with the error filter)', () => {
    const { schema } = errorResponse(422);
    expect(exampleOf(schema)?.errorCode).toBe(ErrorCode.UNPROCESSABLE);
  });

  it('example body is the full failure envelope with success:false and traceId', () => {
    const { schema } = errorResponse(404, { message: 'Project not found.' });
    const ex = exampleOf(schema);
    expect(ex).toEqual({
      success: false,
      message: 'Project not found.',
      errorCode: ErrorCode.NOT_FOUND,
      traceId: expect.any(String),
    });
  });

  it('includes a structured fieldErrors example when provided', () => {
    const { schema } = errorResponse(400, {
      message: 'projectCode: Required',
      fieldErrors: { projectCode: 'Required' },
    });
    expect(exampleOf(schema)?.fieldErrors).toEqual({ projectCode: 'Required' });
  });

  it('applies a custom message for 4xx statuses', () => {
    const { schema } = errorResponse(409, { message: 'Duplicate project code.' });
    expect(exampleOf(schema)?.message).toBe('Duplicate project code.');
  });

  it('applies a custom description', () => {
    const { description } = errorResponse(404, { description: 'The project id does not exist' });
    expect(description).toBe('The project id does not exist');
  });

  it('ignores a custom message for 5xx (fixed, never leaks internals)', () => {
    const { schema } = errorResponse(500, { message: 'DB connection refused at pg:5432' });
    expect(exampleOf(schema)?.message).toBe('Something went wrong. Please try again.');
  });

  it('falls back to INTERNAL_ERROR for an unmapped status', () => {
    const { schema } = errorResponse(418);
    expect(exampleOf(schema)?.errorCode).toBe(ErrorCode.INTERNAL_ERROR);
  });

  it('provides a sensible default message per status when none is given', () => {
    expect(exampleOf(errorResponse(401).schema)?.message).toBe('Authentication required.');
    expect(exampleOf(errorResponse(403).schema)?.message).toBe(
      'You do not have access to this resource.',
    );
  });
});
