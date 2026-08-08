/** Standard success/error envelopes returned by every service. */
export interface ApiSuccess<TData> {
  success: true;
  message: string;
  data: TData;
}

/**
 * Standard error envelope for all 4xx/5xx responses. Shape follows the HLD
 * (§ Error Envelope): `{ errorCode, message, traceId, fieldErrors? }`. We also
 * keep `success: false` so clients can discriminate success/failure on a single
 * boolean without inspecting the status code.
 */
export interface ApiFailure {
  success: false;
  message: string;
  errorCode: ErrorCode;
  /** Correlation id (from the X-Request-Id header) for tracing across services. */
  traceId: string;
  /** Field-level validation errors, keyed by field path. Present on 400/422. */
  fieldErrors?: Record<string, unknown>;
}

/** Stable, machine-readable error codes the frontend can switch on. */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  UNPROCESSABLE = 'UNPROCESSABLE',
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  /** A documented capability that is deliberately not built yet (HTTP 501) —
   * distinct from INTERNAL_ERROR so clients can tell "unavailable feature"
   * apart from "the server broke". */
  NOT_IMPLEMENTED = 'NOT_IMPLEMENTED',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/** Wraps a value in the standard success envelope. */
export function ok<TData>(data: TData, message = 'OK'): ApiSuccess<TData> {
  return { success: true, message, data };
}

/** Builds the standard failure envelope. */
export function fail(
  message: string,
  errorCode: ErrorCode,
  traceId: string,
  fieldErrors?: Record<string, unknown>,
): ApiFailure {
  return fieldErrors
    ? { success: false, message, errorCode, traceId, fieldErrors }
    : { success: false, message, errorCode, traceId };
}
