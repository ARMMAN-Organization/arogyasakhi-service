/**
 * Cross-cutting Supervisor-escalation decision graph — consolidates the
 * miss-escalation rules scattered across SRS v3.0 §3A.2.3: FR-S-3.5/3.6
 * (ANC: 2 consecutive missed / 1 missed HR), SR-ANC-01 (post-EDD visit: 1
 * missed), the PP table (1 missed = escalate), NN (1 missed = escalate),
 * INC (2 consecutive missed / 1 missed HR, same shape as ANC), and CCV
 * (1 missed CCV or CCV-HR = escalate).
 *
 * A single decisionTableNode: visitFamily + isHrVisit selects the
 * miss-count threshold; the caller supplies how many consecutive visits of
 * that family have actually been missed, and the table's `collect` policy
 * would be unnecessary here since exactly one row applies per input
 * combination — kept as `first`.
 *
 * Input: { visitFamily: 'ANC'|'PP'|'NN'|'INC'|'CCV', isHrVisit: boolean, consecutiveMissedCount: number }
 * Output: { shouldEscalate: boolean, reasonCode: string }
 */
export const ESCALATION_DECISION_GRAPH = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'table1',
      type: 'decisionTableNode',
      name: 'escalationThresholds',
      position: { x: 150, y: 0 },
      content: {
        hitPolicy: 'first',
        inputs: [
          { id: 'i1', field: 'visitFamily', name: 'visitFamily', type: 'expression' },
          { id: 'i2', field: 'isHrVisit', name: 'isHrVisit', type: 'expression' },
          {
            id: 'i3',
            field: 'consecutiveMissedCount',
            name: 'consecutiveMissedCount',
            type: 'expression',
          },
        ],
        outputs: [
          { id: 'o1', field: 'shouldEscalate', name: 'shouldEscalate', type: 'expression' },
          { id: 'o2', field: 'reasonCode', name: 'reasonCode', type: 'expression' },
        ],
        rules: [
          // FR-S-3.6 / SR-INC HR rule: 1 missed HR visit (ANC-HR or INC-HR) escalates immediately.
          {
            i1: "'ANC','INC'",
            i2: 'true',
            i3: '>=1',
            o1: 'true',
            o2: "'HR_VISIT_MISSED'",
          },
          // FR-S-3.5 / INC equivalent: 2 consecutive missed non-HR visits escalates.
          {
            i1: "'ANC','INC'",
            i2: 'false',
            i3: '>=2',
            o1: 'true',
            o2: "'TWO_CONSECUTIVE_MISSED'",
          },
          { i1: "'ANC','INC'", i2: '', i3: '', o1: 'false', o2: "'BELOW_THRESHOLD'" },
          // PP/NN/CCV (and CCV-HR, same family CCV): 1 missed visit escalates immediately.
          {
            i1: "'PP','NN','CCV'",
            i2: '',
            i3: '>=1',
            o1: 'true',
            o2: "'ONE_VISIT_MISSED'",
          },
          { i1: "'PP','NN','CCV'", i2: '', i3: '', o1: 'false', o2: "'BELOW_THRESHOLD'" },
        ],
      },
    },
    { id: 'output1', type: 'outputNode', name: 'response', position: { x: 350, y: 0 } },
  ],
  edges: [
    { id: 'e1', sourceId: 'input1', targetId: 'table1', type: 'edge' },
    { id: 'e2', sourceId: 'table1', targetId: 'output1', type: 'edge' },
  ],
};
