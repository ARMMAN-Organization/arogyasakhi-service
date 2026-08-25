import { badGateway } from '@armman/service-commons';

// Same convention as ruleVersion.client.ts: read directly (not via
// appConfig) so importing this client doesn't pull in app-config's full
// schema. Despite the name, this is the gateway's own base URL.
const GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

export interface ScheduleEvaluation {
  ruleVersionId: string;
  [field: string]: unknown;
}

/**
 * Calls rules-service's `POST /rules/:setId/evaluate-schedule` and returns
 * its result, or throws. Unlike scheduleEvaluate.client.ts's evaluateSchedule
 * (best-effort degrade-to-null, used for BR-13's CCV opening-risk-state hint,
 * where a failure just means "skip a nice-to-have flag"), this client throws
 * on any failure — the caller (visitSchedule.service.ts's generateSchedule())
 * persists the dates this evaluation returns, so a silently-missing result
 * must never be mistaken for "no schedule needed." Named evaluateSchedulePack
 * (not evaluateSchedule) specifically so it can't be confused with, or
 * accidentally imported instead of, that other same-signature function.
 */
export async function evaluateSchedulePack(
  ruleSetId: string,
  scheduleKind: string,
  input: Record<string, unknown>,
  authorizationHeader: string,
): Promise<ScheduleEvaluation> {
  const url = `${GATEWAY_BASE_URL}/api/v1/rules/${ruleSetId}/evaluate-schedule`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ scheduleKind, input }),
    });
  } catch {
    throw badGateway('Unable to evaluate the visit schedule — rules-service is unreachable.');
  }

  if (!res.ok) {
    throw badGateway('Unable to evaluate the visit schedule — rules-service returned an error.');
  }

  const body = (await res.json()) as { data: ScheduleEvaluation };
  return body.data;
}
