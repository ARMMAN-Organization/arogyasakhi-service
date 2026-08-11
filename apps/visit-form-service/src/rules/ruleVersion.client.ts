import { badGateway } from '@armman/service-commons';
import type { ScheduleRow } from './scheduleRow.types';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — mirrors geography.client.ts. Despite the name,
// this is the gateway's own base URL (see that file's comment).
const GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

// The SCHEDULE category rule set's fixed id — hardcoded in rules-service's
// own seed (prisma/seed.ts's SCHEDULE_RULE_SET_ID) because the Sakhi mobile
// app also hardcodes it and every environment's seed run must produce the
// same id. Configurable here only as an escape hatch; the default always
// matches rules-service's seed.
const SCHEDULE_RULE_SET_ID =
  process.env.SCHEDULE_RULE_SET_ID ?? '11111111-1111-4111-8111-111111111111';

export interface RuleVersionSummary {
  id: string;
  ruleSetId: string;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
}

/**
 * Fetches a rule version's id/ruleSetId/status via rules-service's
 * `GET /rules/versions/:versionId` (open to any authenticated role), called
 * through the gateway with the original caller's own bearer token forwarded
 * unchanged. Returns null if the version does not exist — callers decide
 * what that means (here: reject the batch with UNKNOWN_RULE_VERSION), same
 * shape as geography.client.ts's 404 handling.
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

export interface EvaluateScheduleFullResult {
  ruleVersionId: string;
  scheduleRows: ScheduleRow[];
}

/**
 * The full ANC schedule (visit-count formula, ANC1, chained ANC2..N) for a
 * new/corrected registrationDate+edd, via rules-service's
 * `POST /rules/:setId/evaluate-schedule/anc-full` — the production caller
 * being visitSchedule.service.ts's regenerateAncSchedule, triggered after a
 * Supervisor-approved LMP/EDD change (FR-SV-4.2).
 */
export async function evaluateAncScheduleFull(
  registrationDate: string,
  edd: string,
  authorizationHeader: string,
): Promise<EvaluateScheduleFullResult> {
  const url = `${GATEWAY_BASE_URL}/api/v1/rules/${SCHEDULE_RULE_SET_ID}/evaluate-schedule/anc-full`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({ registrationDate, edd }),
    });
  } catch {
    throw badGateway('Unable to generate the ANC schedule — rules-service is unreachable.');
  }

  if (!res.ok) {
    throw badGateway('Unable to generate the ANC schedule — rules-service returned an error.');
  }

  const body = (await res.json()) as { data: EvaluateScheduleFullResult };
  return body.data;
}

export interface PublishedRuleSet {
  id: string;
  ruleSetId: string;
  versionNo: string;
  rulesJson: unknown;
  status: 'DRAFT' | 'PUBLISHED' | 'RETIRED';
}

/**
 * Fetches a rule set's currently-published version, including its full
 * rulesJson, via rules-service's `GET /admin/rules/:setId` (open to any
 * authenticated role — see that route's own doc comment). The production
 * consumer is form.service.ts's getActiveVersionRiskRules, resolving a
 * form's configured RISK rule set for a client to cache and evaluate
 * offline (FR-S-5.1). Returns null if the rule set has no published
 * version (404), same shape as findRuleVersion's not-found handling.
 */
export async function fetchPublishedRuleSet(
  ruleSetId: string,
  authorizationHeader: string,
): Promise<PublishedRuleSet | null> {
  const url = `${GATEWAY_BASE_URL}/api/v1/admin/rules/${ruleSetId}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: authorizationHeader } });
  } catch {
    throw badGateway('Unable to fetch the rule set — rules-service is unreachable.');
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw badGateway('Unable to fetch the rule set — rules-service returned an error.');
  }

  const body = (await res.json()) as { data: PublishedRuleSet };
  return body.data;
}
