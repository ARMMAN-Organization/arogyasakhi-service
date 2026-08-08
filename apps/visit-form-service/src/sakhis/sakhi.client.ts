import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — mirrors geography.client.ts. Despite the name,
// this is the gateway's own base URL (see that file's comment).
const GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

export interface Sakhi {
  sakhiId: string;
  supervisorId: string | null;
  primaryProjectId: string;
}

/**
 * Fetches a Sakhi's own record from auth-service (through the gateway, so
 * the caller's forwarded Authorization header is verified) — used to check
 * which Supervisor a Sakhi is actually assigned to before letting a
 * SUPERVISOR caller upload a visit schedule on her behalf. Mirrors
 * supervisor-operations-service's sakhi.client.ts exactly — visit-form-service
 * doesn't own sakhi_profiles (forklift rule: no cross-service DB joins), so
 * this ownership check can only happen over the API.
 */
export async function findSakhiById(
  sakhiId: string,
  authorizationHeader: string,
): Promise<Sakhi | null> {
  const url = `${GATEWAY_BASE_URL}/api/v1/sakhis/${sakhiId}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: authorizationHeader } });
  } catch {
    throw badGateway('Unable to resolve the Sakhi — auth-service is unreachable.');
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw badGateway('Unable to resolve the Sakhi — auth-service returned an error.');
  }

  const body = (await res.json()) as { data: Sakhi };
  return body.data;
}

/**
 * Resolves the Sakhi ids reporting to a given Supervisor, via auth-service's
 * existing `GET /projects/:projectId/sakhis` — mirrors beneficiary-service's
 * sakhi.client.ts's listSakhiIdsForSupervisor exactly. Used to scope
 * `GET /visits/visit-summary` to a Supervisor's own Sakhis' visits.
 */
export async function listSakhiIdsForSupervisor(
  projectId: string,
  supervisorId: string,
  authorizationHeader: string,
): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE_URL}/api/v1/projects/${projectId}/sakhis`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve Sakhis — the auth service is unreachable.');
  }

  if (!res.ok) {
    throw badGateway('Unable to resolve Sakhis — the auth service returned an error.');
  }

  const body = (await res.json()) as { data: Sakhi[] };
  return body.data.filter((sakhi) => sakhi.supervisorId === supervisorId).map((s) => s.sakhiId);
}
