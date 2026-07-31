import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — see geography.client.ts for the same rationale.
const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

interface ApiSakhi {
  sakhiId: string;
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
