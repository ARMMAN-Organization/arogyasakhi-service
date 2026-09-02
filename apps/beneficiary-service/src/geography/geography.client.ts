import { badGateway, forbidden, unauthorized, unprocessable } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — that schema requires DATABASE_URL/PII keys with
// no defaults, which would fail unit tests that never otherwise load config.
const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

interface GeographyUnit {
  geographyUnitId: string;
  parentId: string | null;
  geoType: 'STATE' | 'DISTRICT' | 'BLOCK' | 'PHC' | 'SUBCENTRE' | 'VILLAGE' | 'PADA';
  status: 'ACTIVE' | 'INACTIVE';
  name: string;
}

/**
 * Maps a non-ok auth-service response to the right error class: 401/403
 * mean the caller's own token was rejected (stale/expired/invalid) — thrown
 * as such so it surfaces as an auth failure instead of masquerading as an
 * infra outage. Anything else (5xx, unexpected 4xx) is a genuine dependency
 * failure, kept as 502.
 */
function mapGeographyFetchError(status: number, label: string): Error {
  if (status === 401)
    return unauthorized(`Unable to resolve ${label} — the caller is not authenticated.`);
  if (status === 403)
    return forbidden(`Unable to resolve ${label} — the caller is not authorized.`);
  return badGateway(`Unable to resolve ${label} — the auth service returned an error.`);
}

/** Fetches one geography unit through the gateway, mapping transport/HTTP
 * outcomes to the right error class: a 404 is a client data problem (bad id),
 * anything else non-ok — or a network failure — is an upstream-dependency
 * problem (502), never a 404 to our own caller. */
async function fetchGeographyUnit(
  id: string,
  authorizationHeader: string,
  notFoundMessage: string,
): Promise<GeographyUnit> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_SERVICE_BASE_URL}/api/v1/geography-units/${id}`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    // Network error / timeout reaching auth-service — infra problem, retryable.
    throw badGateway('Unable to resolve geography — the auth service is unreachable.');
  }

  if (res.status === 404) {
    throw unprocessable(notFoundMessage);
  }
  if (!res.ok) {
    // 5xx or any other non-ok from auth-service is a dependency failure, not a
    // "not found" — surface it as 502 so a Sakhi sees a retryable error and it
    // doesn't pollute 404-rate monitoring during an auth-service blip.
    throw mapGeographyFetchError(res.status, 'geography');
  }

  const body = (await res.json()) as { data: GeographyUnit };
  return body.data;
}

/**
 * Resolves a PHC's parent Health Block via auth-service's
 * `GET /geography-units/:id`, called through the gateway (per
 * AUTH_SERVICE_BASE_URL) so the gateway can verify `authorizationHeader` —
 * the original Sakhi caller's own bearer token, forwarded unchanged. There is
 * no service-account/machine-credential concept in this codebase yet (see
 * beneficiary.controller.ts), so this call is only ever made from inside a
 * request that already carries an authenticated caller's token.
 */
export async function resolveHealthBlockIdFromPhc(
  phcId: string,
  authorizationHeader: string,
): Promise<string> {
  const phc = await fetchGeographyUnit(
    phcId,
    authorizationHeader,
    'pii.phcId does not refer to a known geography unit.',
  );

  if (phc.status !== 'ACTIVE') {
    throw unprocessable('pii.phcId refers to an inactive geography unit.');
  }
  if (phc.geoType !== 'PHC') {
    throw unprocessable('pii.phcId does not refer to a PHC-level geography unit.');
  }
  if (!phc.parentId) {
    throw unprocessable('The PHC referenced by pii.phcId has no parent Health Block on record.');
  }

  // Verify the parent is actually a BLOCK (Health Block), not silently trusting
  // the one-level parentId link — a data-entry error in geography_units.parent_id
  // should surface as a 422 rather than persisting a wrong healthBlockId. The
  // parent lookup also enforces active + existence via fetchGeographyUnit.
  const parent = await fetchGeographyUnit(
    phc.parentId,
    authorizationHeader,
    'The Health Block referenced by the PHC does not exist.',
  );
  if (parent.status !== 'ACTIVE') {
    throw unprocessable('The Health Block referenced by the PHC is inactive.');
  }
  if (parent.geoType !== 'BLOCK') {
    throw unprocessable('The parent of pii.phcId is not a Health Block (BLOCK) unit.');
  }

  return parent.geographyUnitId;
}

/**
 * Resolves geographyUnitId -> name for every VILLAGE-level unit, via
 * auth-service's existing `GET /geography-units?geoType=VILLAGE` (no
 * filter-by-id support, and no new auth-service endpoint needed — that
 * route already returns every unit of a given geoType in one call). Used to
 * enrich `GET /beneficiaries` rows with a display-ready villageName, since
 * beneficiary_cases/pii stores only the bare villageId (no cross-service
 * joins, per this service's forklift rule).
 *
 * A villageId not found in the response (stale/since-deleted village) maps
 * to `undefined` in the returned Map — not an error, since the beneficiary
 * case itself is still valid data; the caller decides how to render a
 * missing name (see beneficiary.service.ts's enrichListPage).
 */
export async function resolveVillageNames(
  authorizationHeader: string,
): Promise<Map<string, string>> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_SERVICE_BASE_URL}/api/v1/geography-units?geoType=VILLAGE`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve villages — the auth service is unreachable.');
  }

  if (!res.ok) {
    throw mapGeographyFetchError(res.status, 'villages');
  }

  const body = (await res.json()) as { data: GeographyUnit[] };
  return new Map(body.data.map((v) => [v.geographyUnitId, v.name]));
}

/**
 * Resolves geographyUnitId -> {name, parentId} for every PADA-level unit, via
 * auth-service's existing `GET /geography-units?geoType=PADA`. Used by the
 * pada-breakdown widget to enrich each padaId with a display-ready padaName
 * and (via parentId + resolveVillageNames) villageName. A padaId not found
 * in the response (stale/since-deleted pada) maps to `undefined` — not an
 * error, since the caller decides how to render a missing name.
 */
export async function resolvePadaUnits(
  authorizationHeader: string,
): Promise<Map<string, { name: string; parentId: string | null }>> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_SERVICE_BASE_URL}/api/v1/geography-units?geoType=PADA`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve padas — the auth service is unreachable.');
  }

  if (!res.ok) {
    throw mapGeographyFetchError(res.status, 'padas');
  }

  const body = (await res.json()) as { data: GeographyUnit[] };
  return new Map(body.data.map((p) => [p.geographyUnitId, { name: p.name, parentId: p.parentId }]));
}
