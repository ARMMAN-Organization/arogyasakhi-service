// Read directly (not via appConfig) — see beneficiary.client.ts for why.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

export interface EducationContent {
  topicCode: string;
  topicName: string;
  mediaType: string;
  contentUrl: string | null;
}

/**
 * Resolves a Learn More topic by its stable code, via cms-content-service's
 * existing GET /learn-more/topics/:topicCode (through the gateway) — SRS
 * FR-S-5.2(c)'s "queues a health education message for display", wired to
 * the FR-S-13 Learn More placeholder shell rather than building a second
 * content model. Every isEducationTrigger:true flag resolves to the same
 * seeded COMING_SOON topic today (no RiskCondition -> topicCode mapping
 * exists yet — ARMMAN has not delivered per-condition content; see
 * issue #200 for the open mapping/stage-vocabulary/precedence/delivery
 * decisions this is blocked on).
 *
 * Deliberately swallows every failure (network error, non-2xx, malformed
 * body) and returns null rather than throwing: this is reference/placeholder
 * content, not critical data, so a beneficiary's risk profile must stay
 * readable even if cms-content-service is unreachable. Contrast
 * beneficiary.client.ts/riskGrade.client.ts in this same service, which
 * throw badGateway on failure because their data IS load-bearing for the
 * response (ownership scoping, grade codes).
 */
export async function resolveEducationContent(
  topicCode: string,
  authorizationHeader: string,
): Promise<EducationContent | null> {
  try {
    const res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/learn-more/topics/${topicCode}`, {
      headers: { Authorization: authorizationHeader },
    });
    if (!res.ok) return null;

    const body = (await res.json()) as { data: EducationContent };
    return body.data;
  } catch {
    return null;
  }
}
