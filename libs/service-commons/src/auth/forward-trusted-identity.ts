import type { RequestHandler } from 'express';
import type { TokenSigner } from './token-signer';
import { unauthorized } from '../http/http-error';
import { signInternalIdentity } from './internal-identity-signature';

/** Internal headers the gateway sets after verifying a token; downstream
 * services verify TRUSTED_SIGNATURE_HEADER (see trust-gateway-identity.ts)
 * before trusting these — network-perimeter trust alone is no longer the
 * only thing standing between a forged header and req.user. */
export const TRUSTED_USER_ID_HEADER = 'x-armman-user-id';
export const TRUSTED_ROLES_HEADER = 'x-armman-roles';
export const TRUSTED_PROJECT_ID_HEADER = 'x-armman-project-id';
export const TRUSTED_GEOGRAPHY_UNIT_ID_HEADER = 'x-armman-geography-unit-id';
/** HMAC-SHA256 signature (see internal-identity-signature.ts) over the 4
 * headers above, keyed by INTERNAL_HEADER_SECRET — shared between the
 * gateway and every downstream service. */
export const TRUSTED_SIGNATURE_HEADER = 'x-armman-identity-signature';

/**
 * Gateway-only middleware: verifies the bearer token once at the edge (per the
 * HLD §3.1 Step 2), attaches the verified identity as internal headers on the
 * proxied request, and signs those headers with `internalHeaderSecret` so a
 * downstream service can verify they genuinely came from this gateway
 * (trust-gateway-identity.ts's own doc comment used to note this trust was
 * network-topology-only, with no cryptographic backing — this closes that
 * gap). `authenticate(...)` is NOT re-run downstream — services trust the
 * signed headers instead of re-verifying the original bearer token.
 */
export function verifyAndForwardIdentity(
  signer: Pick<TokenSigner, 'verify'>,
  internalHeaderSecret: string,
): RequestHandler {
  return (req, _res, next) => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) return next(unauthorized());

    const token = header.slice('Bearer '.length).trim();
    if (!token) return next(unauthorized());

    signer
      .verify(token)
      .then((payload) => {
        const fields = {
          userId: String(payload.sub),
          roles: Array.isArray(payload.roles) ? (payload.roles as string[]).join(',') : '',
          projectId: typeof payload.projectId === 'string' ? payload.projectId : '',
          geographyUnitId:
            typeof payload.geographyUnitId === 'string' ? payload.geographyUnitId : '',
        };
        req.headers[TRUSTED_USER_ID_HEADER] = fields.userId;
        req.headers[TRUSTED_ROLES_HEADER] = fields.roles;
        req.headers[TRUSTED_PROJECT_ID_HEADER] = fields.projectId;
        req.headers[TRUSTED_GEOGRAPHY_UNIT_ID_HEADER] = fields.geographyUnitId;
        req.headers[TRUSTED_SIGNATURE_HEADER] = signInternalIdentity(fields, internalHeaderSecret);
        next();
      })
      .catch(() => next(unauthorized('Invalid or expired token.')));
  };
}
