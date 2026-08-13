/**
 * Missed-visit escalation decision graph (SRS §3A.2.7 FR-S-7.1, FR-S-3.5,
 * FR-S-3.6).
 *
 * Decides whether a missed-visit streak should escalate to a Supervisor,
 * given the visit family the missed visit belongs to, whether it was an HR
 * (high-risk) visit, and how many consecutive visits in that family have
 * been missed. This pack does NOT decide what happens after escalation
 * (notification, task creation, etc.) — that is downstream of this rule
 * pack's `shouldEscalate`/`reasonCode` output, same separation-of-concerns
 * as hr.rulesJson.ts only computing the HR visit anchor, not the clinical
 * HR-detection itself.
 *
 * FR-S-7.1 escalation table (verified thresholds — do not alter):
 *  - HR visit missed (`isHrVisit === true`): escalate on the very first miss
 *    (`consecutiveMissedCount >= 1`), regardless of visitFamily — an HR visit
 *    carries its own urgency that overrides the family's normal threshold.
 *    reasonCode: 'HR_VISIT_MISSED'.
 *  - ANC (FR-S-3.5) and INC, non-HR: escalate only after two consecutive
 *    misses (`consecutiveMissedCount >= 2`). reasonCode:
 *    'ANC_TWO_CONSECUTIVE_MISSED' / 'INC_TWO_CONSECUTIVE_MISSED'.
 *  - ANC_POST_EDD, PP, NN, CCV, non-HR: escalate on a single miss
 *    (`consecutiveMissedCount >= 1`). reasonCode: 'SINGLE_VISIT_MISSED'.
 *  - FR-S-3.6 (ANC-HR): an ANC visit flagged HR is handled by the
 *    `isHrVisit === true` branch above, not the ANC branch — the two-miss
 *    ANC threshold only ever applies to non-HR ANC visits.
 *  - Any other visitFamily is a caller/config error, not a business
 *    scenario this pack has an answer for — the handler throws rather than
 *    silently defaulting to "don't escalate", so a bad upstream mapping
 *    fails loudly instead of quietly dropping missed-visit escalations.
 *
 * When NOT escalating, the pack still returns a reasonCode explaining why
 * ('BELOW_THRESHOLD') rather than an empty/undefined value, so callers never
 * have to special-case a missing reasonCode on the false path.
 */
export const escalationRulesJson = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computeEscalation',
      position: { x: 200, y: 0 },
      content: `
const handler = (input) => {
  const { visitFamily, isHrVisit, consecutiveMissedCount } = input;

  // FR-S-7.1: an HR visit miss escalates on the very first miss, regardless
  // of visitFamily - this check takes priority over every family-specific
  // threshold below (including ANC-HR, FR-S-3.6).
  if (isHrVisit === true) {
    return {
      shouldEscalate: consecutiveMissedCount >= 1,
      reasonCode: consecutiveMissedCount >= 1 ? 'HR_VISIT_MISSED' : 'BELOW_THRESHOLD',
    };
  }

  // FR-S-3.5/FR-S-7.1: ANC (non-HR) escalates after two consecutive misses.
  if (visitFamily === 'ANC') {
    return {
      shouldEscalate: consecutiveMissedCount >= 2,
      reasonCode: consecutiveMissedCount >= 2 ? 'ANC_TWO_CONSECUTIVE_MISSED' : 'BELOW_THRESHOLD',
    };
  }

  // FR-S-7.1: INC (non-HR) escalates after two consecutive misses.
  if (visitFamily === 'INC') {
    return {
      shouldEscalate: consecutiveMissedCount >= 2,
      reasonCode: consecutiveMissedCount >= 2 ? 'INC_TWO_CONSECUTIVE_MISSED' : 'BELOW_THRESHOLD',
    };
  }

  // FR-S-7.1: single-visit-family journeys escalate on the very first miss.
  if (
    visitFamily === 'ANC_POST_EDD' ||
    visitFamily === 'PP' ||
    visitFamily === 'NN' ||
    visitFamily === 'CCV'
  ) {
    return {
      shouldEscalate: consecutiveMissedCount >= 1,
      reasonCode: consecutiveMissedCount >= 1 ? 'SINGLE_VISIT_MISSED' : 'BELOW_THRESHOLD',
    };
  }

  throw new Error('Unknown visitFamily: ' + input.visitFamily);
};
      `,
    },
    { id: 'output1', type: 'outputNode', name: 'response', position: { x: 400, y: 0 } },
  ],
  edges: [
    { id: 'e1', sourceId: 'input1', targetId: 'fn1', type: 'edge' },
    { id: 'e2', sourceId: 'fn1', targetId: 'output1', type: 'edge' },
  ],
};
