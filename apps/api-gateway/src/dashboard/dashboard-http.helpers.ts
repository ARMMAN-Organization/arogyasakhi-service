import pino from 'pino';
import {
  authenticate,
  TRUSTED_GEOGRAPHY_UNIT_ID_HEADER,
  TRUSTED_PROJECT_ID_HEADER,
  TRUSTED_ROLES_HEADER,
  TRUSTED_USER_ID_HEADER,
  type AuthenticatedUser,
} from '@armman/service-commons';

// A standalone structured logger for degrade()'s failure logging — not
// req.log, since degrade() call sites across this file/padas.controller.ts/
// pada-visits.controller.ts don't thread req through; matches the shared
// pino JSON-log convention (buildLoggerOptions) instead of console.error.
const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });

/** Alias kept local to these call sites — `authenticate()` is the
 * gateway-side auth middleware here (it never proxies to a downstream
 * service, so `verifyAndForwardIdentity` doesn't apply); these routes just
 * need `Pick<TokenSigner, 'verify'>` (see the shared `authenticate` for
 * why that's now its parameter type) since the gateway holds a
 * verify-only PublicKeyVerifier, never a full sign+verify TokenSigner. */
export const authenticateGateway = authenticate;

/**
 * The same trusted-identity headers `verifyAndForwardIdentity` sets when
 * proxying to a downstream service — duplicated here (not imported from
 * service-commons) because these routes call beneficiary-service/
 * visit-form-service/risk-referral-service/sync-service directly via
 * fetch(), not through the gateway's own proxy layer, so those headers are
 * never set automatically. Every one of those services gates its routes
 * with `trustGatewayIdentity`, which reads these headers — but several of
 * their own controllers (e.g. beneficiary-service's) ALSO independently
 * require the original `Authorization: Bearer` header to still be present
 * (used for their own onward calls to auth-service, e.g. resolving a
 * Supervisor's roster) even though `trustGatewayIdentity` never reads it.
 * `verifyAndForwardIdentity`'s real proxy path forwards both the trusted
 * headers AND the original Authorization header unchanged (it only adds
 * headers, never strips), so both must be sent here too — trusted headers
 * alone 401 at the controller layer despite passing trustGatewayIdentity/
 * requireRoles.
 */
function trustedIdentityHeaders(
  caller: AuthenticatedUser,
  authorizationHeader: string,
): Record<string, string> {
  return {
    Authorization: authorizationHeader,
    [TRUSTED_USER_ID_HEADER]: caller.id,
    [TRUSTED_ROLES_HEADER]: caller.roles.join(','),
    [TRUSTED_PROJECT_ID_HEADER]: caller.projectId ?? '',
    [TRUSTED_GEOGRAPHY_UNIT_ID_HEADER]: caller.geographyUnitId ?? '',
  };
}

export async function fetchJson<T>(
  url: string,
  caller: AuthenticatedUser,
  authorizationHeader: string,
): Promise<T> {
  const res = await fetch(url, { headers: trustedIdentityHeaders(caller, authorizationHeader) });
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status}`);
  }
  const body = (await res.json()) as { data: T };
  return body.data;
}

/** Same as fetchJson but POSTs a JSON body — for the count-by-beneficiary
 * endpoints, which take a (potentially large) beneficiaryIds list that
 * doesn't fit safely in a query string. */
export async function postJson<T>(
  url: string,
  body: unknown,
  caller: AuthenticatedUser,
  authorizationHeader: string,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...trustedIdentityHeaders(caller, authorizationHeader),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status}`);
  }
  const responseBody = (await res.json()) as { data: T };
  return responseBody.data;
}

/**
 * Awaits a downstream summary call and returns its value, or `null` on any
 * failure — graceful degradation per the agreed dashboard contract: one
 * failing summary service must not take down the whole dashboard. Logs the
 * failure so a silently-null section is still visible in server logs.
 */
export async function degrade<T>(label: string, promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    logger.error({ err, label }, `Sakhi dashboard: ${label} failed — degrading to null.`);
    return null;
  }
}
