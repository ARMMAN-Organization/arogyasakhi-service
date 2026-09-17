// Read directly (not via appConfig) — see beneficiary.client.ts for why.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

// A slow (not down) dependency must degrade the same way an unreachable one
// does — without this, a hung gateway/cms-content-service call blocks
// GET /beneficiaries/:beneficiaryId/risk indefinitely, defeating the
// "stays readable even if unreachable" guarantee this function promises.
const REQUEST_TIMEOUT_MS = 3000;

export interface EducationContent {
  // The originating HealthEducationMessage's id — null for the COMING_SOON
  // Learn More placeholder, which has no corresponding message row at all.
  id: string | null;
  topicCode: string;
  topicName: string;
  // null on the COMING_SOON placeholder (same "everything real is null"
  // convention contentUrl already follows on that row) — never a
  // server-supplied English/Marathi placeholder string, so there's nothing
  // for the client to translate or keep in sync with its own coming-soon
  // UI. Real text otherwise. The client keys off topicCode === 'COMING_SOON'
  // to render its own placeholder state.
  bodyEn: string | null;
  bodyMarathi: string | null;
  mediaType: string;
  contentUrl: string | null;
  // Resolved via cms-content-service's Strapi-backed media pipeline (SRS
  // §2.1: "CMS / Media — Strapi — Health education content, Learn More,
  // binary assets"; see healthEducationMedia.syncService.ts) — null until
  // an admin-triggered POST /health-education/media-sync run has matched
  // this message's mediaFile against a Strapi entry's slug. Always null on
  // the COMING_SOON placeholder — there is no HealthEducationMessage row
  // to resolve for it.
  mediaResolvedUrl: string | null;
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
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;

    const body = (await res.json()) as {
      data: { topicCode: string; topicName: string; mediaType: string; contentUrl: string | null };
    };
    const { topicCode: code, topicName, mediaType, contentUrl } = body.data;
    // The Learn More topic this resolves against (cms-content-service's
    // LearnMoreTopic, seeded as the COMING_SOON placeholder) has no body
    // text field at all, and there is no message row to source one from —
    // null, not a placeholder string, per EducationContent's own doc comment.
    return {
      id: null,
      topicCode: code,
      topicName,
      bodyEn: null,
      bodyMarathi: null,
      mediaType,
      contentUrl,
      mediaResolvedUrl: null,
    };
  } catch {
    return null;
  }
}
