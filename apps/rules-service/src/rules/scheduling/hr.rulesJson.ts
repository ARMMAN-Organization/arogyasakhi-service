/**
 * High-Risk (HR) visit scheduling decision graph (SRS §3A.2.5, FR-S-5.2,
 * FR-S-5.3, BR-03).
 *
 * Timing/trigger logic ONLY. This pack does not decide whether a beneficiary
 * IS high-risk - `hrDetectedThisVisit` is an upstream input this pack does
 * not compute. Appendix D ("High Risk Detection Rules") is explicitly
 * marked PENDING in the SRS (§3A.2.5: "PENDING - Updated HR thresholds
 * document from ARMMAN... committed 29 April 2026") and is not available in
 * this repo. The real clinical thresholds (hemoglobin cutoffs, danger
 * signs, etc.) belong in a separate RISK-category rule pack once ARMMAN
 * supplies them - wiring that up is out of scope for this scheduling pack.
 *
 * BR-03: the HR visit anchor is always the ACTUAL completion date of the
 * triggering visit, never the scheduled date - applies identically to
 * ANC-HR, INC-HR and CCV-HR, so all three phases share this one pack/anchor
 * computation rather than three duplicated implementations.
 *
 * FR-S-5.3: cumulative vs single-instance behaviour differs by phase:
 *  - INC (and ANC, same rule): cumulative - every detection generates a new
 *    HR visit, 15 days after actual completion, +/-2 day window, regardless
 *    of whether that condition was flagged before.
 *  - CCV: single-instance per detection - one HR visit 30 days after actual
 *    completion, then reverts to the normal age-based cadence once that HR
 *    visit is completed.
 *
 * BR-06 / SR-NN-01: no HR visits during the neonatal phase - `phase: 'NN'`
 * is not a valid input; the neonatal pack (nn.rulesJson.ts) has no HR
 * output field at all, so there is no call site that could ever invoke this
 * pack for NN.
 */
export const hrRulesJson = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computeHrVisit',
      position: { x: 200, y: 0 },
      content: `
const handler = (input, { dayjs }) => {
  const { phase, hrDetectedThisVisit, actualCompletionDate } = input;

  if (phase !== 'ANC' && phase !== 'INC' && phase !== 'CCV') {
    throw new Error("phase must be one of 'ANC', 'INC', 'CCV' - HR visits are never generated in the neonatal (NN) phase (BR-06/SR-NN-01).");
  }

  if (!hrDetectedThisVisit) {
    return { generateHrVisit: false, hrVisit: null, cumulative: phase !== 'CCV' };
  }

  const actual = dayjs(actualCompletionDate);
  const offsetDays = phase === 'CCV' ? 30 : 15;
  const windowDays = phase === 'CCV' ? 5 : 2;
  const anchor = actual.add(offsetDays, 'day');

  return {
    generateHrVisit: true,
    // Cumulative (ANC/INC): a new HR visit fires on every detection, even if
    // this exact condition triggered one before. Single-instance (CCV): one
    // HR visit per detection event; the caller reverts to normal cadence
    // once this HR visit is completed.
    cumulative: phase !== 'CCV',
    hrVisit: {
      visitName: phase + '-HR',
      scheduledDate: anchor.format('YYYY-MM-DD'),
      windowOpen: anchor.subtract(windowDays, 'day').format('YYYY-MM-DD'),
      windowClose: anchor.add(windowDays, 'day').format('YYYY-MM-DD'),
    },
  };
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
