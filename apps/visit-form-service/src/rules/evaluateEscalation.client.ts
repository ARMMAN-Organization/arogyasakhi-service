import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) — matches scheduleEvaluate.client.ts's stance.
const GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

export interface EscalationEvaluationResult {
  shouldEscalate: boolean;
  reasonCode: string;
}

/**
 * Calls rules-service's `POST /rules/:setId/evaluate-escalation` through the
 * gateway, authenticated as this service's SYSTEM machine identity — used by
 * missedVisit.job.ts. Unlike scheduleEvaluate.client.ts, failures here are
 * thrown, not swallowed: a missed evaluation must not silently look like
 * "don't escalate" for a real missed visit.
 */
export async function evaluateEscalation(
  ruleSetId: string,
  input: { visitFamily: string; isHrVisit: boolean; consecutiveMissedCount: number },
  authorizationHeader: string,
): Promise<EscalationEvaluationResult> {
  let res: Response;
  try {
    res = await fetch(`${GATEWAY_BASE_URL}/api/v1/rules/${ruleSetId}/evaluate-escalation`, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
    });
  } catch {
    throw badGateway('Unable to evaluate the escalation — rules-service is unreachable.');
  }

  if (!res.ok) {
    throw badGateway('Unable to evaluate the escalation — rules-service returned an error.');
  }

  const body = (await res.json()) as { data: EscalationEvaluationResult };
  return body.data;
}
