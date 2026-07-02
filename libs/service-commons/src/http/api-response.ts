/** Standard success/error envelopes returned by every service. */
export interface ApiSuccess<TData> {
  success: true;
  message: string;
  data: TData;
}

export interface ApiFailure {
  success: false;
  message: string;
  errorCode: ErrorCode;
  details?: Record<string, unknown>;
}

/** Stable, machine-readable error codes the frontend can switch on. */
export enum ErrorCode {
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
