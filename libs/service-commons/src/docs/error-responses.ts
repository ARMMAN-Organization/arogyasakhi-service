import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z, type ZodTypeAny } from 'zod';
import { ErrorCode } from '../http/api-response';

extendZodWithOpenApi(z);

/**
 * Documentation for error responses, kept truthful to what the API actually
 * returns. Every failure is the standard envelope
 * `{ success:false, message, errorCode, traceId, fieldErrors? }` (see `fail()`
 * in api-response.ts), matching the HLD error envelope. The `errorCode` for a
 * given HTTP status is decided by `STATUS_TO_CODE` in all-exceptions.filter.ts.
 */

/** Example correlation id shown in error-body documentation. */
const EXAMPLE_TRACE_ID = '1d3fef3d-b418-48ba-882d-982b86473911';

/** The exact errorCode literal the error filter emits for each HTTP status. */
const STATUS_TO_ERROR_CODE: Record<number, ErrorCode> = {
  400: ErrorCode.VALIDATION_ERROR,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.NOT_FOUND,
  409: ErrorCode.CONFLICT,
  413: ErrorCode.PAYLOAD_TOO_LARGE,
  422: ErrorCode.UNPROCESSABLE,
  500: ErrorCode.INTERNAL_ERROR,
};

/** Default human-readable `description` shown per status in Swagger UI. */
const DEFAULT_DESCRIPTION: Record<number, string> = {
  400: 'Validation error — one or more fields failed schema validation',
  401: 'Unauthenticated — missing, malformed, or expired credentials',
  403: 'Forbidden — the caller role is not permitted to perform this action',
  404: 'Not found',
  409: 'Conflict — the request violates a uniqueness or state constraint',
  413: 'Payload too large — the request exceeds a size/count limit',
  422: 'Unprocessable — a business rule rejected an otherwise well-formed request',
  500: 'Internal server error — an unexpected failure; internals are never leaked',
};

/** A realistic `message` example per status, matching the implementation. */
const DEFAULT_MESSAGE: Record<number, string> = {
  400: 'fieldName: Required',
  401: 'Authentication required.',
  403: 'You do not have access to this resource.',
  404: 'Not found.',
  409: 'A resource with this unique key already exists.',
  413: 'Request exceeds the maximum allowed size.',
  422: 'The request could not be processed.',
  // The 5xx client message is a fixed string set by the error filter and is
  // never overridable — internals must not leak.
  500: 'Something went wrong. Please try again.',
};

export interface ErrorResponseOptions {
  /**
   * Overrides the human-readable `description` for this status (e.g. a
   * per-endpoint 404/409 reason). 500 keeps its fixed description.
   */
  description?: string;
  /**
   * Overrides the example `message` shown in the response body (e.g.
   * "Project not found."). Ignored for 500, whose message is fixed by the
   * error filter and must not be customized.
   */
  message?: string;
  /**
   * Example `fieldErrors` object for statuses that carry field-level detail
   * (typically 400). Keyed by field path.
   */
  fieldErrors?: Record<string, unknown>;
}

/**
 * Builds the OpenAPI response entry for a documented error status: a Zod
 * schema whose `errorCode` is the exact literal the API returns, plus a real
 * example body (`{ success, message, errorCode, traceId, fieldErrors? }`).
 *
 *   responses: {
 *     200: { description: 'Project detail', schema: envelope(projectSchema) },
 *     404: errorResponse(404, { message: 'Project not found.' }),
 *     500: errorResponse(500),
 *   }
 */
export function errorResponse(
  status: number,
  options: ErrorResponseOptions = {},
): { description: string; schema: ZodTypeAny } {
  const errorCode = STATUS_TO_ERROR_CODE[status] ?? ErrorCode.INTERNAL_ERROR;
  const description = options.description ?? DEFAULT_DESCRIPTION[status] ?? 'Error';
  // 5xx message is fixed by the error filter and must never be customized.
  const message =
    status >= 500
      ? DEFAULT_MESSAGE[500]
      : (options.message ?? DEFAULT_MESSAGE[status] ?? 'Request failed.');
  const fieldErrors = options.fieldErrors;

  const exampleBody = {
    success: false as const,
    message,
    errorCode,
    traceId: EXAMPLE_TRACE_ID,
    ...(fieldErrors ? { fieldErrors } : {}),
  };

  const schema = z
    .object({
      success: z.literal(false),
      message: z.string().openapi({ example: message }),
      errorCode: z.literal(errorCode).openapi({ example: errorCode }),
      traceId: z.string().openapi({
        description: 'Request correlation id (X-Request-Id).',
        example: EXAMPLE_TRACE_ID,
      }),
      fieldErrors: z.record(z.unknown()).optional(),
    })
    .openapi({ example: exampleBody });

  return { description, schema };
}
