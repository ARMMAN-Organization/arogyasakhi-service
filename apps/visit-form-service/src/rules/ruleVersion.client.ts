import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — mirrors geography.client.ts. Despite the name,
// this is the gateway's own base URL (see that file's comment).
const GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

export interface RuleVersionSummary {
  id: string;
  ruleSetId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
}

/**
 * Fetches a rule version's id/ruleSetId/status via rules-service's
 * `GET /rules/versions/:versionId` (open to any authenticated role, unlike
 * the ADMIN-only /admin/rules/:setId), called through the gateway with the
 * original caller's own bearer token forwarded unchanged. Returns null if
 * the version does not exist — callers decide what that means (here: reject
 * the batch with UNKNOWN_RULE_VERSION), same shape as geography.client.ts's
 * 404 handling.
 */
export async function findRuleVersion(
  ruleVersionId: string,
  authorizationHeader: string,
): Promise<RuleVersionSummary | null> {
  const url = `${GATEWAY_BASE_URL}/api/v1/rules/versions/${ruleVersionId}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: authorizationHeader } });
  } catch {
    throw badGateway('Unable to verify the rule version — rules-service is unreachable.');
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw badGateway('Unable to verify the rule version — rules-service returned an error.');
  }

  const body = (await res.json()) as { data: RuleVersionSummary };
  return body.data;
}
