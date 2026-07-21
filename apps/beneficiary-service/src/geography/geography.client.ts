import { notFound, unprocessable } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — that schema requires DATABASE_URL/PII keys with
// no defaults, which would fail unit tests that never otherwise load config.
const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

interface GeographyUnit {
  geographyUnitId: string;
  parentId: string | null;
  geoType: 'STATE' | 'DISTRICT' | 'BLOCK' | 'PHC' | 'SUBCENTRE' | 'VILLAGE' | 'PADA';
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
  const url = `${AUTH_SERVICE_BASE_URL}/api/v1/geography-units/${phcId}`;
  const res = await fetch(url, { headers: { Authorization: authorizationHeader } });

  if (res.status === 404) {
    throw unprocessable('pii.phcId does not refer to a known geography unit.');
  }
  if (!res.ok) {
    throw notFound('Unable to resolve pii.phcId — geography lookup failed.');
  }

  const body = (await res.json()) as { data: GeographyUnit };
  const phc = body.data;

  if (phc.geoType !== 'PHC') {
    throw unprocessable('pii.phcId does not refer to a PHC-level geography unit.');
  }
  if (!phc.parentId) {
    throw unprocessable('The PHC referenced by pii.phcId has no parent Health Block on record.');
  }

  return phc.parentId;
}
