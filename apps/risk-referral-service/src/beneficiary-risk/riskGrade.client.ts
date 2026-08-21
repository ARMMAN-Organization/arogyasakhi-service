import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) — see beneficiary.client.ts for why.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

interface LookupValue {
  id: string;
  valueCode: string;
  sortOrder: number;
}

interface LookupCategory {
  categoryCode: string;
  values: LookupValue[];
}

/**
 * Resolves every RISK_GRADE lookup_value_id -> {code, sortOrder}, via
 * auth-service's existing `GET /lookups/RISK_GRADE` (through the gateway).
 * `sortOrder` (seeded 0=NORMAL..5=CRITICAL) doubles as a severity rank for
 * "ever highest grade" comparisons in getRiskState — no separate rank table
 * needed. Used because `risk_flags.risk_grade_lookup_value_id` is an
 * environment-specific FK, not a stable literal.
 */
export async function resolveRiskGrades(
  authorizationHeader: string,
): Promise<Map<string, { code: string; sortOrder: number }>> {
  let res: Response;
  try {
    res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/lookups/RISK_GRADE`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve RISK_GRADE — the auth service is unreachable.');
  }

  if (!res.ok) {
    throw badGateway('Unable to resolve RISK_GRADE — the auth service returned an error.');
  }

  const body = (await res.json()) as { data: LookupCategory };
  return new Map(
    body.data.values.map((v) => [v.id, { code: v.valueCode, sortOrder: v.sortOrder }]),
  );
}
