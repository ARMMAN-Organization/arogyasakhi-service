import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) — see geography.client.ts (beneficiary-service)
// for why. Despite the name, this is the gateway's own base URL.
const GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

interface LookupValue {
  id: string;
  valueCode: string;
  valueLabel: string;
}

interface LookupCategory {
  categoryCode: string;
  values: LookupValue[];
}

/**
 * Fetches the full VISIT_STATUS category (STARTED/PENDING/MISSED/COMPLETED/
 * DISCARDED, per auth-service's seed-data.ts), keyed by lookup_value_id —
 * needed because a raw lookup_value_id UUID is opaque and not portable
 * across environments; callers need the semantic valueCode. Mirrors
 * beneficiary-service's lookup.client.ts fetchLookupCategory.
 */
async function fetchVisitStatusCategory(authorizationHeader: string): Promise<Map<string, string>> {
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE_URL}/api/v1/lookups/VISIT_STATUS`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve visit status — auth-service is unreachable.');
  }

  if (!res.ok) {
    throw badGateway('Unable to resolve visit status — auth-service returned an error.');
  }

  const body = (await res.json()) as { data: LookupCategory };
  return new Map(body.data.values.map((v) => [v.id, v.valueCode]));
}

/**
 * Resolves a single VISIT_STATUS lookup_value_id to its stable valueCode —
 * needed because visitInstance.service.ts must know the *semantic* status
 * (is this transition to COMPLETED? is the visit already COMPLETED?).
 * Returns null if the id doesn't resolve to a known value — the caller
 * treats that as "unrecognized status", not a crash.
 */
export async function resolveVisitStatusCode(
  lookupValueId: string,
  authorizationHeader: string,
): Promise<string | null> {
  const byId = await fetchVisitStatusCategory(authorizationHeader);
  return byId.get(lookupValueId) ?? null;
}

/**
 * Resolves every VISIT_STATUS lookup_value_id in one call — used by
 * getVisitSummary to translate a page of visits' raw statusLookupValueId
 * into human-readable byStatus counts without a per-row lookup.
 */
export async function resolveVisitStatusCodes(
  authorizationHeader: string,
): Promise<Map<string, string>> {
  return fetchVisitStatusCategory(authorizationHeader);
}

/**
 * The reverse of {@link resolveVisitStatusCode} — resolves a VISIT_STATUS
 * valueCode (e.g. "MISSED") to its lookup_value_id. Needed by the
 * missed-visit job (missedVisit.job.ts), which must WRITE a
 * statusLookupValueId, not just read one. Throws if the code isn't a known
 * VISIT_STATUS value — a misconfigured/renamed lookup category must fail the
 * job run loudly, not silently skip every visit.
 */
export async function resolveVisitStatusIdByCode(
  valueCode: string,
  authorizationHeader: string,
): Promise<string> {
  const byId = await fetchVisitStatusCategory(authorizationHeader);
  for (const [id, code] of byId) {
    if (code === valueCode) return id;
  }
  throw badGateway(`Unable to resolve VISIT_STATUS code "${valueCode}" to a lookup_value_id.`);
}
