import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — see geography.client.ts's own note on why.
const RISK_REFERRAL_SERVICE_BASE_URL =
  process.env.RISK_REFERRAL_SERVICE_BASE_URL ?? 'http://localhost:3000';

interface RiskConditionRow {
  id: string;
  conditionCode: string;
  conditionName: string;
  gradeScale: 'BINARY' | 'NORMAL_MILD_MODERATE_SEVERE' | 'NORMAL_LOW_MEDIUM_HIGH';
}

/**
 * Resolves riskConditionId -> {conditionCode, conditionName, gradeScale} for
 * the given batch, via risk-referral-service's existing
 * `GET /risk-conditions?ids=...` (called through the gateway, per
 * RISK_REFERRAL_SERVICE_BASE_URL, so the gateway can verify
 * `authorizationHeader` — the original caller's own bearer token, forwarded
 * unchanged, same pattern as geography.client.ts). Used to enrich
 * `GET /beneficiaries/:id`'s riskConditionSummaries with a display-ready
 * name, since BeneficiaryRiskConditionSummary stores only the bare
 * riskConditionId (no cross-service joins, per this service's forklift
 * rule).
 *
 * An id not found in the response (retired/INACTIVE condition, or a stale
 * id) maps to `undefined` in the returned Map — not an error, since the
 * beneficiary case itself is still valid data; the caller decides how to
 * render an unresolved condition (see beneficiary.service.ts's projectCase).
 *
 * An empty `ids` array short-circuits to an empty Map without a network call.
 */
export async function resolveRiskConditions(
  ids: string[],
  authorizationHeader: string,
): Promise<Map<string, { conditionCode: string; conditionName: string; gradeScale: string }>> {
  if (ids.length === 0) return new Map();

  let res: Response;
  try {
    res = await fetch(
      `${RISK_REFERRAL_SERVICE_BASE_URL}/api/v1/risk-conditions?ids=${ids.join(',')}`,
      { headers: { Authorization: authorizationHeader } },
    );
  } catch {
    // Network error / timeout reaching risk-referral-service — infra problem,
    // retryable. Callers of this function are expected to catch this and
    // degrade to null names rather than failing the whole beneficiary
    // response — a downstream risk-referral-service blip shouldn't take
    // down GET /beneficiaries/:id.
    throw badGateway('Unable to resolve risk conditions — the risk service is unreachable.');
  }

  if (!res.ok) {
    throw badGateway('Unable to resolve risk conditions — the risk service returned an error.');
  }

  const body = (await res.json()) as { data: RiskConditionRow[] };
  return new Map(
    body.data.map((c) => [
      c.id,
      { conditionCode: c.conditionCode, conditionName: c.conditionName, gradeScale: c.gradeScale },
    ]),
  );
}
