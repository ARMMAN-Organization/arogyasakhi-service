import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) — see beneficiary.client.ts for why.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

interface ApiSakhi {
  sakhiId: string;
  supervisorId: string | null;
}

/**
 * Resolves the Sakhi ids reporting to a given Supervisor, via auth-service's
 * existing `GET /projects/:projectId/sakhis` (no new auth-service endpoint —
 * that route already returns each Sakhi's `supervisorId`), called through
 * the gateway. Used to scope `GET /risk/by-sakhi/:sakhiId` to a Supervisor's
 * own roster — duplicated from beneficiary-risk/sakhi.client.ts rather than
 * imported, per the forklift rule (no cross-feature imports within a
 * service either, only shared framework code).
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
