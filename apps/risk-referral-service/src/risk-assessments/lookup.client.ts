import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) — see beneficiary.client.ts in this
// service for why.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

interface LookupValue {
  id: string;
  valueCode: string;
}

interface LookupCategory {
  categoryCode: string;
  values: LookupValue[];
}

/**
 * Resolves a RISK_GRADE valueCode (NORMAL/MILD/MODERATE/SEVERE/HIGH/CRITICAL,
 * per auth-service's seed-data.ts) to its lookup_values id — RiskFlag stores
 * `riskGradeLookupValueId`, not the bare grade string, since RISK_GRADE is
 * owned by auth-service (no cross-service relation). Mirrors
 * beneficiary-service's lookup.client.ts fetchLookupCategory pattern.
 * Throws unprocessable-mapped badGateway on network/5xx; returns null for an
 * unrecognized grade so the caller can turn that into a clean 400 (a rule
 * pack that outputs a grade string not seeded in RISK_GRADE is a
 * config/authoring problem, not a crash).
 */
export async function resolveRiskGradeLookupId(
  grade: string,
  authorizationHeader: string,
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/lookups/RISK_GRADE`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve risk grade — auth-service is unreachable.');
  }

  if (!res.ok) {
    throw badGateway('Unable to resolve risk grade — auth-service returned an error.');
  }

  const body = (await res.json()) as { data: LookupCategory };
  const match = body.data.values.find((v) => v.valueCode === grade);
  return match?.id ?? null;
}
