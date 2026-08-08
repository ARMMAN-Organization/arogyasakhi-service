import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — see geography.client.ts for the same rationale.
const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

interface ApiSakhi {
  sakhiId: string;
  displayName: string;
  supervisorId: string | null;
}

/**
 * Resolves the Sakhi ids reporting to a given Supervisor, via auth-service's
 * existing `GET /projects/:projectId/sakhis` (no new auth-service endpoint —
 * that route already returns each Sakhi's `supervisorId`). Used to scope
 * `GET /beneficiaries` to a Supervisor's own Sakhis' cases.
 *
 * Called through the gateway (per AUTH_SERVICE_BASE_URL) so the gateway can
 * verify `authorizationHeader` — the original Supervisor caller's own bearer
 * token, forwarded unchanged, matching geography.client.ts's convention.
 *
 * Reads the full response body with no pagination handling — safe today
 * because `SakhiRepository.findByProject` (auth-service) queries with no
 * `take`/`skip`. If that endpoint is ever paginated, this must change too,
 * or a Supervisor with Sakhis beyond the first page would silently see an
 * under-scoped (incomplete) beneficiary list instead of an error.
 */
export async function listSakhiIdsForSupervisor(
  projectId: string,
  supervisorId: string,
  authorizationHeader: string,
): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_SERVICE_BASE_URL}/api/v1/projects/${projectId}/sakhis`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve Sakhis — the auth service is unreachable.');
  }

  if (!res.ok) {
    throw badGateway('Unable to resolve Sakhis — the auth service returned an error.');
  }

  const body = (await res.json()) as { data: ApiSakhi[] };
  return body.data.filter((sakhi) => sakhi.supervisorId === supervisorId).map((s) => s.sakhiId);
}

/**
 * Resolves sakhiId -> displayName for every Sakhi reporting to a given
 * Supervisor, via the same `GET /projects/:projectId/sakhis` call as
 * {@link listSakhiIdsForSupervisor} — used by BeneficiaryService.list to
 * enrich response rows with a display-ready sakhiName for a SUPERVISOR
 * caller without a second round-trip, since that roster call already
 * happens for scoping.
 */
export async function listSakhiNamesForSupervisor(
  projectId: string,
  supervisorId: string,
  authorizationHeader: string,
): Promise<Map<string, string>> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_SERVICE_BASE_URL}/api/v1/projects/${projectId}/sakhis`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve Sakhis — the auth service is unreachable.');
  }

  if (!res.ok) {
    throw badGateway('Unable to resolve Sakhis — the auth service returned an error.');
  }

  const body = (await res.json()) as { data: ApiSakhi[] };
  return new Map(
    body.data
      .filter((sakhi) => sakhi.supervisorId === supervisorId)
      .map((s) => [s.sakhiId, s.displayName]),
  );
}

/**
 * Resolves a single sakhiId -> displayName via auth-service's existing
 * `GET /sakhis/:sakhiId`. Used as the MANAGER/ADMIN fallback path in
 * BeneficiaryService.list's row enrichment, where there is no per-Supervisor
 * roster call to piggyback on and rows can span multiple projects/Sakhis a
 * SUPERVISOR-scoped roster call would never cover.
 *
 * A 404 (unknown/deleted Sakhi) resolves to `null` — the beneficiary case
 * itself is still valid data, so a stale sakhiId must not fail the whole
 * list response. Only a genuine dependency failure (network/5xx) is a 502.
 */
export async function getSakhiName(
  sakhiId: string,
  authorizationHeader: string,
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_SERVICE_BASE_URL}/api/v1/sakhis/${sakhiId}`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve a Sakhi — the auth service is unreachable.');
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw badGateway('Unable to resolve a Sakhi — the auth service returned an error.');
  }

  const body = (await res.json()) as { data: ApiSakhi };
  return body.data.displayName;
}
