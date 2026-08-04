import { notFound } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — mirrors geography.client.ts. Despite the name,
// this is the gateway's own base URL (see that file's comment) — every
// cross-service call in this service goes through the gateway so it can
// verify the forwarded Authorization header, never straight to another
// service's port.
const GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

/**
 * Confirms a beneficiaryId exists via beneficiary-service's
 * `GET /beneficiaries/:id`, called through the gateway with the original
 * caller's own bearer token forwarded unchanged.
 *
 * Existence-only — GET /beneficiaries/:id has no ownership scoping today (any
 * SAKHI/SUPERVISOR/MANAGER can fetch any beneficiary by id), so this cannot
 * confirm the caller may write to it, only that the id is real. Tracked as a
 * follow-up; see the beneficiary-service ownership-scoping issue.
 */
export async function beneficiaryExists(
  beneficiaryId: string,
  authorizationHeader: string,
): Promise<boolean> {
  const url = `${GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}`;
  const res = await fetch(url, { headers: { Authorization: authorizationHeader } });

  if (res.status === 404) return false;
  if (!res.ok) {
    throw notFound('Unable to verify the beneficiary — beneficiary lookup failed.');
  }
  return true;
}
