import { notFound } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — mirrors beneficiary-service's geography.client.ts.
const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

export interface GeographyUnit {
  geographyUnitId: string;
  parentId: string | null;
  geoType: 'STATE' | 'DISTRICT' | 'BLOCK' | 'PHC' | 'SUBCENTRE' | 'VILLAGE' | 'PADA';
  geoCode: string | null;
  name: string;
  status: 'ACTIVE' | 'INACTIVE';
}

/**
 * Resolves a geography unit's full ancestor chain via auth-service's
 * `GET /geography-units/:id/ancestors`, called through the gateway (per
 * AUTH_SERVICE_BASE_URL) so the gateway can verify `authorizationHeader` —
 * the original caller's own bearer token, forwarded unchanged. Returns the
 * chain ordered from `geographyUnitId` itself up to STATE.
 */
export async function getAncestorChain(
  geographyUnitId: string,
  authorizationHeader: string,
): Promise<GeographyUnit[]> {
  const url = `${AUTH_SERVICE_BASE_URL}/api/v1/geography-units/${geographyUnitId}/ancestors`;
  const res = await fetch(url, { headers: { Authorization: authorizationHeader } });

  if (res.status === 404) {
    throw notFound("The caller's assigned geography unit was not found.");
  }
  if (!res.ok) {
    throw notFound("Unable to resolve the caller's geography chain — geography lookup failed.");
  }

  const body = (await res.json()) as { data: GeographyUnit[] };
  return body.data;
}
