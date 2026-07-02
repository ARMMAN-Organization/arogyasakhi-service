/**
 * Generated typed clients/types will be emitted here from `openapi/openapi.yaml`
 * (see `npm run generate`). Until generation is wired up, shared transport types
 * live below so services and the web app agree on the envelope shape.
 */
export interface ApiError {
  success: false;
  message: string;
  errorCode: string;
  details?: Record<string, unknown>;
}
