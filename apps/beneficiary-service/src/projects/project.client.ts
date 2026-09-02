import { badGateway, forbidden, unauthorized } from '@armman/service-commons';

// Read directly (not via appConfig) — see geography.client.ts for why.
const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

interface ApiProject {
  projectId: string;
  projectName: string;
}

/**
 * Maps a non-ok auth-service response to the right error class: 401/403
 * mean the caller's own token was rejected (stale/expired/invalid) — thrown
 * as such so it surfaces as an auth failure instead of masquerading as an
 * infra outage. Anything else (5xx, unexpected 4xx) is a genuine dependency
 * failure, kept as 502.
 */
function mapProjectFetchError(status: number): Error {
  if (status === 401)
    return unauthorized('Unable to resolve projects — the caller is not authenticated.');
  if (status === 403)
    return forbidden('Unable to resolve projects — the caller is not authorized.');
  return badGateway('Unable to resolve projects — the auth service returned an error.');
}

/**
 * Resolves projectId -> projectName for a set of ids, via auth-service's
 * existing `GET /projects` (no filter-by-id support, and no new auth-service
 * endpoint — that route already returns every active project in one call).
 * Used to enrich `GET /beneficiaries` rows with a display-ready projectName,
 * since beneficiary_cases stores only the bare projectId (no cross-service
 * joins, per this service's forklift rule).
 *
 * A projectId not found in the response (stale/since-deleted project) maps
 * to `undefined` in the returned Map — not an error, since the beneficiary
 * case itself is still valid data; the caller decides how to render a
 * missing name (see beneficiary.service.ts's enrichListPage).
 *
 * `GET /projects` itself scopes a non-privileged caller's response to only
 * their own project (see auth-service's project.service.ts) — so a
 * SUPERVISOR resolving names for a page containing a beneficiary case
 * outside their own project (roster-scoping is by Sakhi identity, not
 * project, so this can happen) will get `undefined` for that row's
 * projectName too. Known, accepted behavior, not a bug: the same
 * null-on-unresolvable contract as any other stale/missing id here.
 */
export async function resolveProjectNames(
  authorizationHeader: string,
): Promise<Map<string, string>> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_SERVICE_BASE_URL}/api/v1/projects`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve projects — the auth service is unreachable.');
  }

  if (!res.ok) {
    throw mapProjectFetchError(res.status);
  }

  const body = (await res.json()) as { data: ApiProject[] };
  return new Map(body.data.map((p) => [p.projectId, p.projectName]));
}
