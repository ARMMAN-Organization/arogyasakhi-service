import { badGateway } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

interface ApiSakhi {
  sakhiId: string;
  supervisorId: string | null;
}

/**
 * Resolves the Sakhi ids reporting to a given Supervisor, via auth-service's
 * existing `GET /projects/:projectId/sakhis` (no new auth-service endpoint —
 * that route already returns each Sakhi's `supervisorId`), called through
 * the gateway. Used to scope `PATCH /referrals/:id/decision` to a
 * Supervisor's own roster — mirrors beneficiary-service's
 * listSakhiIdsForSupervisor exactly, duplicated here since this service has
 * no shared client library to import it from (forklift rule: no
 * cross-service imports).
 */
export async function listSakhiIdsForSupervisor(
  projectId: string,
  supervisorId: string,
  authorizationHeader: string,
): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/projects/${projectId}/sakhis`, {
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
