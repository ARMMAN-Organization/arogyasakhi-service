// Read directly (not via appConfig) — see beneficiary.client.ts for why.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

// A slow (not down) dependency must degrade the same way an unreachable one
// does — without this, a hung gateway/cms-content-service call blocks
// GET /beneficiaries/:beneficiaryId/risk indefinitely, defeating the
// "stays readable even if unreachable" guarantee this function promises.
// Matches educationContent.client.ts's own guard in this same directory,
// and visit-form-service's healthEducation.client.ts counterpart.
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
 * Resolves ARMMAN's delivered per-condition content via
 * cms-content-service's GET /health-education/messages?conditionLabel=...
 * (through the gateway), used only for conditionCodes present in
 * beneficiaryRisk.service.ts's CONDITION_CODE_TO_LABEL map. Always
 * resolves every message for the condition, unfiltered — the caller
 * (beneficiaryRisk.service.ts's isPostpartumStage) does its own
 * phase-appropriate filtering client-side, since cms-content-service's
 * `stage` filter matches its free-text column verbatim and this caller
 * needs a "does this stage look like postpartum" classification the
 * server-side filter can't express.
 *
 * Deliberately swallows every failure and returns an empty array rather
 * than throwing — same rationale as resolveEducationContent: this is
 * reference content, not critical data, so a beneficiary's risk profile
 * must stay readable even if cms-content-service is unreachable or slow.
 */
export async function resolveHealthEducationMessages(
  conditionLabel: string,
  authorizationHeader: string,
): Promise<HealthEducationMessage[]> {
  try {
    const params = new URLSearchParams({ conditionLabel });
    const res = await fetch(
      `${API_GATEWAY_BASE_URL}/api/v1/health-education/messages?${params.toString()}`,
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
