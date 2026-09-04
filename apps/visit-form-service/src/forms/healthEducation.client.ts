// Read directly (not via appConfig) — matches geography.client.ts's stance.
const GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

const REQUEST_TIMEOUT_MS = 3000;

export interface HealthEducationMessage {
  id: string;
  riskConditionId: string | null;
  conditionLabel: string;
  stage: string;
  messageOrder: number;
  titleEn: string | null;
  bodyEn: string;
  bodyMarathi: string;
  mediaType: string;
  mediaFile: string | null;
  sortOrder: number;
}

/**
 * Resolves every seeded health-education message whose `stage` matches
 * cms-content-service's own free-text `stage` column verbatim, via
 * `GET /health-education/messages?stage=...` (through the gateway) — used by
 * healthEducationStage.resolver.ts for the SRS's stage-based (not
 * risk-graded) health-education conditions (Danger Signs, Neonatal Care,
 * POSTPARTUM Counselling, etc. — see that resolver's own doc comment for
 * why these are a separate mechanism from risk-referral-service's
 * risk-flag-triggered content).
 *
 * Deliberately swallows every failure and returns an empty array rather
 * than throwing — this is reference content, not critical data, so a form
 * submission must never fail because cms-content-service is unreachable.
 */
export async function resolveHealthEducationMessagesByStage(
  stage: string,
  authorizationHeader: string,
): Promise<HealthEducationMessage[]> {
  try {
    const res = await fetch(
      `${GATEWAY_BASE_URL}/api/v1/health-education/messages?stage=${encodeURIComponent(stage)}`,
      {
        headers: { Authorization: authorizationHeader },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      },
    );
    if (!res.ok) return [];

    const body = (await res.json()) as { data: HealthEducationMessage[] };
    return body.data;
  } catch {
    return [];
  }
}
