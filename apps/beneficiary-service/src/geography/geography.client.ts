import { badGateway, unprocessable } from '@armman/service-commons';

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
  geoCode: string | null;
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
    throw badGateway('Unable to resolve geography — the auth service returned an error.');
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
 * Resolves the State/District/Block geoCode triple for the SRS "Unique ID"
 * field (State(2)-District(3)-Block(3)-ID(6), see generateUniqueId.ts), given
 * a Health Block's geographyUnitId. Walks Block -> District -> State via
 * parentId, verifying each level's geoType as it goes (same defensive pattern
 * as resolveHealthBlockIdFromPhc — a geography_units.parent_id data-entry
 * error surfaces as a 422, not a wrong/silent code).
 *
 * A null geoCode at any level throws rather than falling back to a derived
 * value (e.g. truncating `name`) — a beneficiary's Unique ID must be sourced
 * from a real geoCode, not a guess, per product decision. The fix for a null
 * geoCode is an ADMIN setting one on that geography unit, not a client-side
 * workaround.
 */
export async function resolveGeographyCodesForBlock(
  healthBlockId: string,
  authorizationHeader: string,
): Promise<{ stateCode: string; districtCode: string; blockCode: string }> {
  const block = await fetchGeographyUnit(
    healthBlockId,
    authorizationHeader,
    'The Health Block resolved for this beneficiary does not exist.',
  );
  if (block.geoType !== 'BLOCK') {
    throw unprocessable('The resolved healthBlockId is not a Health Block (BLOCK) unit.');
  }
  if (!block.geoCode) {
    throw unprocessable(
      `Cannot generate a Unique ID: the Health Block "${block.name}" has no geoCode set.`,
    );
  }
  if (!block.parentId) {
    throw unprocessable('The Health Block has no parent District on record.');
  }

  const district = await fetchGeographyUnit(
    block.parentId,
    authorizationHeader,
    'The District referenced by the Health Block does not exist.',
  );
  if (district.geoType !== 'DISTRICT') {
    throw unprocessable('The parent of the Health Block is not a District unit.');
  }
  if (!district.geoCode) {
    throw unprocessable(
      `Cannot generate a Unique ID: the District "${district.name}" has no geoCode set.`,
    );
  }
  if (!district.parentId) {
    throw unprocessable('The District has no parent State on record.');
  }

  const state = await fetchGeographyUnit(
    district.parentId,
    authorizationHeader,
    'The State referenced by the District does not exist.',
  );
  if (state.geoType !== 'STATE') {
    throw unprocessable('The parent of the District is not a State unit.');
  }
  if (!state.geoCode) {
    throw unprocessable(
      `Cannot generate a Unique ID: the State "${state.name}" has no geoCode set.`,
    );
  }

  return { stateCode: state.geoCode, districtCode: district.geoCode, blockCode: block.geoCode };
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
    throw badGateway('Unable to resolve villages — the auth service returned an error.');
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
    throw badGateway('Unable to resolve padas — the auth service returned an error.');
  }

  const body = (await res.json()) as { data: GeographyUnit[] };
  return new Map(body.data.map((p) => [p.geographyUnitId, { name: p.name, parentId: p.parentId }]));
}
