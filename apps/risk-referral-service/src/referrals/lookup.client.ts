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
 * Resolves a REFERRAL_TYPE valueCode (e.g. ACCOMPANIED) to its lookup_values
 * id, via auth-service's GET /lookups/:categoryCode. Referrals stores
 * `referralTypeLookupValueId`, not the bare code, since REFERRAL_TYPE is
 * owned by auth-service (no cross-service relation) — see create-referral.dto.ts.
 * Used by referral-summary to count accompanied referrals without
 * hardcoding a lookup_value id. Mirrors risk-assessments/lookup.client.ts's
 * resolveRiskGradeLookupId pattern. Returns null for an unrecognized code so
 * the caller can treat "no ACCOMPANIED value seeded yet" as zero matches
 * rather than a crash.
 */
export async function resolveReferralTypeLookupId(
  valueCode: string,
  authorizationHeader: string,
): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/lookups/REFERRAL_TYPE`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to resolve referral type — auth-service is unreachable.');
  }

  if (!res.ok) {
    throw badGateway('Unable to resolve referral type — auth-service returned an error.');
  }

  const body = (await res.json()) as { data: LookupCategory };
  const match = body.data.values.find((v) => v.valueCode === valueCode);
  return match?.id ?? null;
}
