import type { RequestHandler } from 'express';
import type { TokenSigner } from './token-signer';
import { unauthorized } from '../http/http-error';

/** Internal headers the gateway sets after verifying a token; downstream
 * services trust these because they only accept traffic via the gateway
 * (no other ingress reaches them in production). */
export const TRUSTED_USER_ID_HEADER = 'x-armman-user-id';
export const TRUSTED_ROLES_HEADER = 'x-armman-roles';
export const TRUSTED_PROJECT_ID_HEADER = 'x-armman-project-id';
export const TRUSTED_GEOGRAPHY_UNIT_ID_HEADER = 'x-armman-geography-unit-id';

/**
 * Gateway-only middleware: verifies the bearer token once at the edge (per the
 * HLD §3.1 Step 2) and attaches the verified identity as internal headers on
 * the proxied request. Downstream services read these headers via
 * `authenticate(...)` is NOT re-run there — they trust the gateway's headers
 * directly, since the gateway is the only ingress that reaches them.
 */
export function verifyAndForwardIdentity(signer: Pick<TokenSigner, 'verify'>): RequestHandler {
  return (req, _res, next) => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) return next(unauthorized());

    const token = header.slice('Bearer '.length).trim();
    if (!token) return next(unauthorized());

    signer
      .verify(token)
      .then((payload) => {
        req.headers[TRUSTED_USER_ID_HEADER] = String(payload.sub);
        req.headers[TRUSTED_ROLES_HEADER] = Array.isArray(payload.roles)
          ? (payload.roles as string[]).join(',')
          : '';
        req.headers[TRUSTED_PROJECT_ID_HEADER] =
          typeof payload.projectId === 'string' ? payload.projectId : '';
        req.headers[TRUSTED_GEOGRAPHY_UNIT_ID_HEADER] =
          typeof payload.geographyUnitId === 'string' ? payload.geographyUnitId : '';
        next();
      })
      .catch(() => next(unauthorized('Invalid or expired token.')));
  };
}
