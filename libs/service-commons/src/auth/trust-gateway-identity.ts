import type { RequestHandler } from 'express';
import {
  TRUSTED_GEOGRAPHY_UNIT_ID_HEADER,
  TRUSTED_PROJECT_ID_HEADER,
  TRUSTED_ROLES_HEADER,
  TRUSTED_SIGNATURE_HEADER,
  TRUSTED_USER_ID_HEADER,
} from './forward-trusted-identity';
import { verifyInternalIdentitySignature } from './internal-identity-signature';
import { unauthorized } from '../http/http-error';
import type { AuthMarker } from './authenticate';
import './authenticate'; // registers the `req.user` type augmentation

// Read directly (not via each service's own appConfig) so this middleware
// works as a drop-in constant at all ~60 existing `trustGatewayIdentity`
// call sites across every service, with no signature change — same
// direct-env-read convention as service-token-client.ts's
// API_GATEWAY_BASE_URL. Every service and the gateway must be provisioned
// with the same value.
const INTERNAL_HEADER_SECRET = process.env.INTERNAL_HEADER_SECRET;

/**
 * Downstream-service middleware: populates `req.user` from the identity
 * headers the API Gateway set after verifying the JWT (see
 * `verifyAndForwardIdentity`). Services behind the gateway do NOT re-verify
 * the original bearer token themselves — instead they verify
 * TRUSTED_SIGNATURE_HEADER, an HMAC-SHA256 signature over the 4 identity
 * headers keyed by a secret shared only between the gateway and this
 * service (see internal-identity-signature.ts). This closes a gap noted in
 * an earlier version of this comment: bare network-perimeter trust ("the
 * gateway is the only ingress that reaches them") with no cryptographic
 * check meant any direct network access to this service — a misconfigured
 * security group, a compromised sibling container, etc. — could forge these
 * headers with zero resistance. `requireRoles(...)` consumes `req.user`
 * exactly the same way as with `authenticate(...)`.
 *
 * If `INTERNAL_HEADER_SECRET` is unset, every request is rejected with 401
 * (fail-closed) rather than silently falling back to the old unsigned-trust
 * behavior — a service running with signature verification effectively
 * disabled must be a deliberate, visible misconfiguration, not a silent one.
 */
export const trustGatewayIdentity: RequestHandler & AuthMarker = Object.assign(
  (
    req: Parameters<RequestHandler>[0],
    _res: Parameters<RequestHandler>[1],
    next: Parameters<RequestHandler>[2],
  ) => {
    if (!INTERNAL_HEADER_SECRET) return next(unauthorized('Service misconfigured.'));

    const userId = req.header(TRUSTED_USER_ID_HEADER);
    if (!userId) return next(unauthorized());

    const roles = req.header(TRUSTED_ROLES_HEADER) ?? '';
    const projectId = req.header(TRUSTED_PROJECT_ID_HEADER) ?? '';
    const geographyUnitId = req.header(TRUSTED_GEOGRAPHY_UNIT_ID_HEADER) ?? '';
    const signature = req.header(TRUSTED_SIGNATURE_HEADER);

    const verified = verifyInternalIdentitySignature(
      signature,
      { userId, roles, projectId, geographyUnitId },
      INTERNAL_HEADER_SECRET,
    );
    if (!verified) {
      return next(unauthorized('Invalid or missing internal identity signature.'));
    }

    req.user = {
      id: userId,
      roles: roles ? roles.split(',') : [],
      projectId: projectId || null,
      geographyUnitId: geographyUnitId || null,
    };
    next();
  },
  { __requiresAuth: true as const },
);
