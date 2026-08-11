/**
 * ANC (Antenatal Care) visit-schedule decision graph — SRS v3.0 §3A.2.3
 * "ANC Visit Schedule" (FR-S-3.1 through FR-S-3.7, SR-ANC-01).
 *
 * A decisionTableNode holds every tunable SRS constant (chain interval, HR
 * offset, window sizes, post-EDD grace period) as editable rows — the "no
 * hardcoded logic" business numbers. A functionNode does only the date
 * arithmetic (dayjs add/diff/format), since the ZEN Expression Language has
 * no reliable way to format a computed date back to a YYYY-MM-DD string
 * (verified against the live engine — see design doc).
 *
 * scheduleOrchestrator.ts calls this graph once per candidate visit — with
 * `mode` selecting which SRS rule to apply for that call — and assembles the
 * full per-beneficiary ANC schedule from the responses.
 *
 * Input contract (one call per candidate visit):
 *   mode: 'VISIT_COUNT' | 'ANC1' | 'CHAINED' | 'HR' | 'POST_EDD'
 *   registrationDate, edd: 'YYYY-MM-DD'
 *   previousScheduledDate?: 'YYYY-MM-DD'   — required for CHAINED
 *   actualCompletionDate?: 'YYYY-MM-DD'    — required for HR
 *   totalRegularAncVisits?: number         — required for POST_EDD (naming)
 *   sequenceNo: number                     — the visit's own sequence number
 *
 * Output contract per mode:
 *   VISIT_COUNT: { visitCount: number }
 *   ANC1 | CHAINED | POST_EDD: { scheduleRows: ScheduleRow[] }
 *   HR: { scheduleRows: ScheduleRow[] }
 */
export const ANC_DECISION_GRAPH = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'constants1',
      type: 'decisionTableNode',
      name: 'ancConstants',
      position: { x: 150, y: 0 },
      content: {
        hitPolicy: 'first',
        // Merges the decision table's output constants back into the
        // original request context — without this, the downstream
        // functionNode would receive ONLY {anc1WindowDays, ...} and lose
        // registrationDate/edd/mode/etc (verified live: a decisionTableNode
        // replaces context by default, it does not merge).
        passThrough: true,
        inputs: [{ id: 'i1', field: 'mode', name: 'mode', type: 'expression' }],
        outputs: [
          { id: 'o1', field: 'anc1WindowDays', name: 'anc1WindowDays', type: 'expression' },
          { id: 'o2', field: 'chainIntervalDays', name: 'chainIntervalDays', type: 'expression' },
          { id: 'o3', field: 'chainWindowDays', name: 'chainWindowDays', type: 'expression' },
          { id: 'o4', field: 'hrOffsetDays', name: 'hrOffsetDays', type: 'expression' },
          { id: 'o5', field: 'hrWindowDays', name: 'hrWindowDays', type: 'expression' },
          { id: 'o6', field: 'postEddGraceDays', name: 'postEddGraceDays', type: 'expression' },
          { id: 'o7', field: 'postEddOffsetDays', name: 'postEddOffsetDays', type: 'expression' },
          { id: 'o8', field: 'postEddWindowDays', name: 'postEddWindowDays', type: 'expression' },
        ],
        rules: [
          // FR-S-3.2: ANC1 window Day 0 to +5.
          { i1: "'ANC1'", o1: '5', o2: '', o3: '', o4: '', o5: '', o6: '', o7: '', o8: '' },
          // FR-S-3.3: ANC2..N every 30 days, window scheduled ±5.
          { i1: "'CHAINED'", o1: '', o2: '30', o3: '5', o4: '', o5: '', o6: '', o7: '', o8: '' },
          // FR-S-3.4: ANC-HR = actual completion +15, window ±2.
          { i1: "'HR'", o1: '', o2: '', o3: '', o4: '15', o5: '2', o6: '', o7: '', o8: '' },
          // SR-ANC-01: grace period EDD+7, extra visit anchored EDD+8, window +8 to +13 (one-sided, 5 days).
          { i1: "'POST_EDD'", o1: '', o2: '', o3: '', o4: '', o5: '', o6: '7', o7: '8', o8: '5' },
        ],
      },
    },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computeAnc',
      position: { x: 350, y: 0 },
      content: `const handler = (input, { dayjs }) => {
        const toIso = (d) => d.format('YYYY-MM-DD');
        const reg = dayjs(input.registrationDate);
        const edd = dayjs(input.edd);

        if (input.mode === 'VISIT_COUNT') {
          const totalDays = edd.diff(reg, 'day');
          const visitCount = Math.round(totalDays / 30) + 1;
          return { visitCount };
        }

        if (input.mode === 'ANC1') {
          const scheduledDate = reg;
          return {
            scheduleRows: [{
              localScheduleUuid: input.localScheduleUuid,
              visitCode: 'ANC1',
              visitType: 'ANC',
              sequenceNo: 1,
              scheduledDate: toIso(scheduledDate),
              windowStartDate: toIso(scheduledDate),
              windowEndDate: toIso(scheduledDate.add(input.anc1WindowDays, 'day')),
              anchorType: 'REGISTRATION',
              anchorVisitLocalUuid: null,
            }],
          };
        }

        if (input.mode === 'CHAINED') {
          const previous = dayjs(input.previousScheduledDate);
          const scheduledDate = previous.add(input.chainIntervalDays, 'day');
          return {
            scheduleRows: [{
              localScheduleUuid: input.localScheduleUuid,
              visitCode: 'ANC' + input.sequenceNo,
              visitType: 'ANC',
              sequenceNo: input.sequenceNo,
              scheduledDate: toIso(scheduledDate),
              windowStartDate: toIso(scheduledDate.subtract(input.chainWindowDays, 'day')),
              windowEndDate: toIso(scheduledDate.add(input.chainWindowDays, 'day')),
              anchorType: 'REGISTRATION',
              anchorVisitLocalUuid: input.previousVisitLocalUuid ?? null,
            }],
          };
        }

        if (input.mode === 'HR') {
          const actual = dayjs(input.actualCompletionDate);
          const scheduledDate = actual.add(input.hrOffsetDays, 'day');
          return {
            scheduleRows: [{
              localScheduleUuid: input.localScheduleUuid,
              visitCode: 'ANC_HR',
              visitType: 'ANC_HR',
              sequenceNo: input.sequenceNo,
              scheduledDate: toIso(scheduledDate),
              windowStartDate: toIso(scheduledDate.subtract(input.hrWindowDays, 'day')),
              windowEndDate: toIso(scheduledDate.add(input.hrWindowDays, 'day')),
              anchorType: 'ACTUAL_VISIT',
              anchorVisitLocalUuid: input.triggeringVisitLocalUuid ?? null,
            }],
          };
        }

        if (input.mode === 'POST_EDD') {
          // SR-ANC-01: only generated if delivery form not filed by EDD + graceDays.
          if (!input.deliveryFormFiled && input.daysSinceEdd < input.postEddGraceDays) {
            return { scheduleRows: [] };
          }
          const scheduledDate = edd.add(input.postEddOffsetDays, 'day');
          const visitName = 'ANC' + (input.totalRegularAncVisits + 1);
          return {
            scheduleRows: [{
              localScheduleUuid: input.localScheduleUuid,
              visitCode: visitName,
              visitType: 'ANC_POST_EDD',
              sequenceNo: input.totalRegularAncVisits + 1,
              scheduledDate: toIso(scheduledDate),
              windowStartDate: toIso(scheduledDate),
              windowEndDate: toIso(scheduledDate.add(input.postEddWindowDays, 'day')),
              anchorType: 'EDD',
              anchorVisitLocalUuid: null,
            }],
          };
        }

        return { scheduleRows: [] };
      };`,
    },
    { id: 'output1', type: 'outputNode', name: 'response', position: { x: 550, y: 0 } },
  ],
  edges: [
    { id: 'e1', sourceId: 'input1', targetId: 'constants1', type: 'edge' },
    { id: 'e2', sourceId: 'constants1', targetId: 'fn1', type: 'edge' },
    { id: 'e3', sourceId: 'fn1', targetId: 'output1', type: 'edge' },
  ],
};
