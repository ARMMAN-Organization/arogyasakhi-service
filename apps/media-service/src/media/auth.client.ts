import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — see beneficiary-service's sakhi.client.ts for
// the same rationale.
const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3002';

/**
 * Resolves a user's display name via auth-service's `GET /users/:id/name`,
 * forwarding the caller's own bearer token — same pattern as
 * beneficiary-service's `sakhi.client.ts`. A 404 (unknown/deleted user)
 * resolves to `null` rather than failing the whole media lookup — a stale
 * `uploadedByUserId` must not block viewing the asset itself.
 */
export async function getUserDisplayName(
  userId: string,
  authorizationHeader: string,
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${AUTH_SERVICE_BASE_URL}/api/v1/users/${userId}/name`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve the uploader — the auth service is unreachable.');
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw badGateway('Unable to resolve the uploader — the auth service returned an error.');
  }

  const body = (await res.json()) as { data: { displayName: string } };
  return body.data.displayName;
}
