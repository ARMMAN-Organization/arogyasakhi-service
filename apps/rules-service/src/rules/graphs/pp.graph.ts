/**
 * PP (Postpartum) visit-schedule decision graph — SRS v3.0 §3A.2.3 "PP Visit
 * Schedule". All PP visits anchor to the delivery date; schedule fixed at
 * delivery-form submission, does not shift on actual completion.
 *
 * A decisionTableNode holds the fixed PP1–PP5 day-offset/window table
 * (editable SRS constants); a functionNode applies the offsets to
 * `deliveryDate` and formats the result. PP5's window is encoded exactly as
 * written in the SRS (Day+113 to +123 — opens AFTER the scheduled date,
 * unlike PP1–PP4 whose windows straddle the scheduled date) per explicit
 * confirmation that the SRS text is authoritative, not a transcription typo
 * to "fix".
 *
 * Input: { visitCode: 'PP1'..'PP5', deliveryDate: 'YYYY-MM-DD', localScheduleUuid, anchorVisitLocalUuid? }
 * Output: { scheduleRows: ScheduleRow[] }
 */
export const PP_DECISION_GRAPH = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'table1',
      type: 'decisionTableNode',
      name: 'ppTable',
      position: { x: 150, y: 0 },
      content: {
        hitPolicy: 'first',
        passThrough: true,
        inputs: [{ id: 'i1', field: 'visitCode', name: 'visitCode', type: 'expression' }],
        outputs: [
          { id: 'o1', field: 'sequenceNo', name: 'sequenceNo', type: 'expression' },
          {
            id: 'o2',
            field: 'scheduledOffsetDays',
            name: 'scheduledOffsetDays',
            type: 'expression',
          },
          {
            id: 'o3',
            field: 'windowStartOffsetDays',
            name: 'windowStartOffsetDays',
            type: 'expression',
          },
          {
            id: 'o4',
            field: 'windowEndOffsetDays',
            name: 'windowEndOffsetDays',
            type: 'expression',
          },
        ],
        rules: [
          { i1: "'PP1'", o1: '1', o2: '0', o3: '0', o4: '14' },
          { i1: "'PP2'", o1: '2', o2: '15', o3: '15', o4: '28' },
          { i1: "'PP3'", o1: '3', o2: '58', o3: '53', o4: '63' },
          { i1: "'PP4'", o1: '4', o2: '88', o3: '83', o4: '93' },
          // Encoded literally per SRS text: window opens AFTER the scheduled
          // date (+113 open vs +105 scheduled) — confirmed intentional, not a typo.
          { i1: "'PP5'", o1: '5', o2: '105', o3: '113', o4: '123' },
        ],
      },
    },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computePp',
      position: { x: 350, y: 0 },
      content: `const handler = (input, { dayjs }) => {
        const toIso = (d) => d.format('YYYY-MM-DD');
        const delivery = dayjs(input.deliveryDate);
        const scheduledDate = delivery.add(input.scheduledOffsetDays, 'day');
        const windowStartDate = delivery.add(input.windowStartOffsetDays, 'day');
        const windowEndDate = delivery.add(input.windowEndOffsetDays, 'day');
        return {
          scheduleRows: [{
            localScheduleUuid: input.localScheduleUuid,
            visitCode: input.visitCode,
            visitType: 'PP',
            sequenceNo: input.sequenceNo,
            scheduledDate: toIso(scheduledDate),
            windowStartDate: toIso(windowStartDate),
            windowEndDate: toIso(windowEndDate),
            anchorType: 'DELIVERY_DATE',
            anchorVisitLocalUuid: input.anchorVisitLocalUuid ?? null,
          }],
        };
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
