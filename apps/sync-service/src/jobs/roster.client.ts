import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) — matches sakhi.client.ts's convention
// in this same service.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

interface ApiProject {
  projectId: string;
}

interface ApiSakhi {
  sakhiId: string;
  supervisorId: string | null;
  status: string;
}

/**
 * Every active project, via auth-service's `GET /projects` — called with a
 * SYSTEM service token, which auth-service's ProjectService treats as
 * privileged (unscoped), same as MANAGER/ADMIN. Used to enumerate the
 * full roster for the SYNC_DELAY escalation sweep, which has no single
 * Supervisor/project context of its own (unlike a real HTTP request).
 */
export async function listAllProjectIds(systemAccessToken: string): Promise<string[]> {
  let res: Response;
  try {
    res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/projects`, {
      headers: { Authorization: `Bearer ${systemAccessToken}` },
    });
  } catch {
    throw badGateway('Unable to resolve projects — the auth service is unreachable.');
  }
  if (!res.ok) {
    throw badGateway('Unable to resolve projects — the auth service returned an error.');
  }
  const body = (await res.json()) as { data: ApiProject[] };
  return body.data.map((p) => p.projectId);
}

/**
 * Every ACTIVE Sakhi under one project, via auth-service's existing
 * `GET /projects/:projectId/sakhis` — requires the SYSTEM role to be added
 * to that route (see sakhi.routes.ts), same pattern as the other SYSTEM-
 * permitted Sakhi routes in that file. Filters to ACTIVE here (not left to
 * the caller) since an INACTIVE/LOCKED/PAUSED/DELETED Sakhi has no reason
 * to be escalated for a stale sync.
 */
export async function listActiveSakhisForProject(
  projectId: string,
  systemAccessToken: string,
): Promise<{ sakhiId: string; supervisorId: string | null }[]> {
  let res: Response;
  try {
    res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/projects/${projectId}/sakhis`, {
      headers: { Authorization: `Bearer ${systemAccessToken}` },
    });
  } catch {
    throw badGateway('Unable to resolve Sakhis — the auth service is unreachable.');
  }
  if (!res.ok) {
    throw badGateway('Unable to resolve Sakhis — the auth service returned an error.');
  }
  const body = (await res.json()) as { data: ApiSakhi[] };
  return body.data
    .filter((s) => s.status === 'ACTIVE')
    .map((s) => ({ sakhiId: s.sakhiId, supervisorId: s.supervisorId }));
}
