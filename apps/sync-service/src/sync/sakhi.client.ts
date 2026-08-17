import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema (requires DATABASE_URL/PUBLIC_BASE_URLS with no
// defaults) — matches risk-referral-service's referrals/sakhi.client.ts.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

interface ApiSakhi {
  sakhiId: string;
  supervisorId: string | null;
}

/**
 * Resolves the Sakhi ids reporting to a given Supervisor, via auth-service's
 * existing `GET /projects/:projectId/sakhis`, called through the gateway.
 * Used to scope `GET /sync/last-synced` to a Supervisor's own roster.
 * Duplicated from risk-referral-service's identical helper — this service
 * has no shared client library to import it from (forklift rule: no
 * cross-service imports).
 */
export async function listSakhiIdsForSupervisor(
  projectId: string,
  supervisorId: string,
  authorizationHeader: string,
): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/projects/${projectId}/sakhis`, {
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
