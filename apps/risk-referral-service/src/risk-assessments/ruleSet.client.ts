import { badGateway, unprocessable, HttpError } from '@armman/service-commons';

const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

export interface RiskEvaluationResult {
  riskConditionId: string;
  grade: string;
  gradeRank: number;
  isReferralTrigger: boolean;
  isEducationTrigger: boolean;
  isHrVisitTrigger: boolean;
  observedValueJson: Record<string, unknown> | null;
}

interface EvaluateResponse {
  ruleVersionId: string;
  overallRiskCategory: 'NORMAL' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  conditions: RiskEvaluationResult[];
}

/**
 * Calls rules-service's `POST /rules/:setId/evaluate` through the gateway,
 * forwarding the caller's own Authorization header (this codebase has no
 * machine/service-account identity — see that endpoint's doc comment).
 * 422 (no published version for this rule set) is re-thrown as-is so the
 * caller can decide how to surface "this form's ruleSetId has nothing
 * published yet" — not swallowed into a generic 502.
 */
export async function evaluateRuleSet(
  ruleSetId: string,
  answers: Record<string, unknown>,
  authorizationHeader: string,
): Promise<EvaluateResponse> {
  let res: Response;
  try {
    res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/rules/${ruleSetId}/evaluate`, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
  } catch {
    throw badGateway('Unable to evaluate the rule set — rules-service is unreachable.');
  }

  if (res.status === 422) {
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw unprocessable(body?.message ?? 'No published rule pack version found for this rule set.');
  }
  if (!res.ok) {
    if (res.status >= 400 && res.status < 500) {
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new HttpError(res.status, body?.message ?? 'Unable to evaluate the rule set.');
    }
    throw badGateway('Unable to evaluate the rule set — rules-service returned an error.');
  }

  const body = (await res.json()) as { data: EvaluateResponse };
  return body.data;
}
