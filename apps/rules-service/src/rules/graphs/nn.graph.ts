/**
 * NN (Newborn) visit-schedule decision graph — SRS v3.0 §3A.2.3 "NN Visit
 * Schedule". Governed by which day (relative to delivery date) the delivery
 * form was filled — three scenarios (A/B/C).
 *
 * A decisionTableNode classifies `deliveryFormFilledDay` into scenario A/B/C
 * and returns each scenario's fixed NN1/NN2 generation flags and window
 * bounds (all SRS constants, editable). A functionNode applies those to
 * `deliveryDate` and formats results — NN1 and NN2 windows are FIXED date
 * ranges (not scheduledDate ± N), per SRS explicit note.
 *
 * Input: { deliveryDate: 'YYYY-MM-DD', deliveryFormFilledDay: number, localScheduleUuid1, localScheduleUuid2?, anchorVisitLocalUuid? }
 * Output: { scheduleRows: ScheduleRow[] } — 0, 1, or 2 rows depending on scenario.
 */
export const NN_DECISION_GRAPH = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'table1',
      type: 'decisionTableNode',
      name: 'nnScenarioTable',
      position: { x: 150, y: 0 },
      content: {
        hitPolicy: 'first',
        passThrough: true,
        inputs: [
          {
            id: 'i1',
            field: 'deliveryFormFilledDay',
            name: 'deliveryFormFilledDay',
            type: 'expression',
          },
        ],
        outputs: [
          { id: 'o1', field: 'scenario', name: 'scenario', type: 'expression' },
          { id: 'o2', field: 'generateNn1', name: 'generateNn1', type: 'expression' },
          { id: 'o3', field: 'nn1WindowStartDays', name: 'nn1WindowStartDays', type: 'expression' },
          { id: 'o4', field: 'nn1WindowEndDays', name: 'nn1WindowEndDays', type: 'expression' },
          { id: 'o5', field: 'nn2WindowStartDays', name: 'nn2WindowStartDays', type: 'expression' },
          { id: 'o6', field: 'nn2WindowEndDays', name: 'nn2WindowEndDays', type: 'expression' },
        ],
        rules: [
          // Scenario A: filled Day 0-14. NN1 same day, window [0,14]. NN2 window [15,28].
          { i1: '[0..14]', o1: "'A'", o2: 'true', o3: '0', o4: '14', o5: '15', o6: '28' },
          // Scenario B: filled Day 15-27. NN1 skipped. NN2 window [fillDay,28].
          { i1: '[15..27]', o1: "'B'", o2: 'false', o3: '', o4: '', o5: '', o6: '28' },
          // Scenario C: filled exactly Day 28. NN1 skipped. NN2 filled same session, single day.
          { i1: '28', o1: "'C'", o2: 'false', o3: '', o4: '', o5: '28', o6: '28' },
        ],
      },
    },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computeNn',
      position: { x: 350, y: 0 },
      content: `const handler = (input, { dayjs }) => {
        const toIso = (d) => d.format('YYYY-MM-DD');
        const delivery = dayjs(input.deliveryDate);
        const rows = [];

        if (input.generateNn1) {
          rows.push({
            localScheduleUuid: input.localScheduleUuid1,
            visitCode: 'NN1',
            visitType: 'NN',
            sequenceNo: 1,
            scheduledDate: toIso(delivery),
            windowStartDate: toIso(delivery.add(input.nn1WindowStartDays, 'day')),
            windowEndDate: toIso(delivery.add(input.nn1WindowEndDays, 'day')),
            anchorType: 'DELIVERY_DATE',
            anchorVisitLocalUuid: null,
          });
        }

        // NN2 is always generated (immediately in scenarios B/C, after NN1
        // completion in scenario A) — the SRS names it NN2 in every scenario.
        const nn2WindowStart = input.scenario === 'A'
          ? delivery.add(input.nn2WindowStartDays, 'day')
          : delivery.add(input.deliveryFormFilledDay, 'day');
        rows.push({
          localScheduleUuid: input.localScheduleUuid2,
          visitCode: 'NN2',
          visitType: 'NN',
          sequenceNo: 2,
          scheduledDate: toIso(nn2WindowStart),
          windowStartDate: toIso(nn2WindowStart),
          windowEndDate: toIso(delivery.add(input.nn2WindowEndDays, 'day')),
          anchorType: 'DELIVERY_DATE',
          anchorVisitLocalUuid: input.generateNn1 ? (input.anchorVisitLocalUuid ?? null) : null,
        });

        return { scheduleRows: rows, scenario: input.scenario };
      };`,
    },
    { id: 'output1', type: 'outputNode', name: 'response', position: { x: 550, y: 0 } },
  ],
  edges: [
    { id: 'e1', sourceId: 'input1', targetId: 'table1', type: 'edge' },
    { id: 'e2', sourceId: 'table1', targetId: 'fn1', type: 'edge' },
    { id: 'e3', sourceId: 'fn1', targetId: 'output1', type: 'edge' },
  ],
};
