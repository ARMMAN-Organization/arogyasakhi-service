// Read directly (not via appConfig) — see beneficiary.client.ts for why.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

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
 * beneficiaryRisk.service.ts's CONDITION_CODE_TO_LABEL map. `stage` is
 * optional — when supplied it narrows to the stage-appropriate message(s)
 * for the assessment's own riskPhase (e.g. Anemia's "postpartum" message on
 * a PP-phase assessment, not its ANC-detection message); omitted, every
 * message for the condition is returned, letting the caller decide (used
 * for the riskPhase-is-null degradation case — see toAssessmentView).
 *
 * Deliberately swallows every failure and returns an empty array rather
 * than throwing — same rationale as resolveEducationContent: this is
 * reference content, not critical data, so a beneficiary's risk profile
 * must stay readable even if cms-content-service is unreachable.
 */
export async function resolveHealthEducationMessages(
  conditionLabel: string,
  authorizationHeader: string,
  stage?: string,
): Promise<HealthEducationMessage[]> {
  try {
    const params = new URLSearchParams({ conditionLabel });
    if (stage) params.set('stage', stage);
    const res = await fetch(
      `${API_GATEWAY_BASE_URL}/api/v1/health-education/messages?${params.toString()}`,
      { headers: { Authorization: authorizationHeader } },
    );
    if (!res.ok) return [];

    const body = (await res.json()) as { data: HealthEducationMessage[] };
    return body.data;
  } catch {
    return [];
  }
}
