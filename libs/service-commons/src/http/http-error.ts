/** Error carrying an HTTP status; thrown by handlers to signal a specific code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Convenience constructors mirroring the common HTTP error statuses. */
export const badRequest = (message: string, details?: Record<string, unknown>): HttpError =>
  new HttpError(400, message, details);
export const unauthorized = (message = 'Authentication required.'): HttpError => new HttpError(401, message);
export const forbidden = (message = 'You do not have access to this resource.'): HttpError =>
  new HttpError(403, message);
export const notFound = (message = 'Not found.'): HttpError => new HttpError(404, message);
export const conflict = (message: string): HttpError => new HttpError(409, message);
