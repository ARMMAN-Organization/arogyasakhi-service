/**
 * INC (Infant Care, 0–12 months) visit-schedule decision graph — SRS v3.0
 * §3A.2.3 "INC Visit Schedule (0–12 months)". Two-formula approach keyed on
 * whether registration happened in the first 58 days from DOB ("early") or
 * later ("late"), plus a hard DOB+370 cutoff and an HR mode (actual+15±2,
 * same pattern as ANC-HR).
 *
 * A decisionTableNode classifies early/late (Day 0–58 inclusive = early, per
 * SRS "Day 0 to Day 58") and carries the fixed chain interval / hard-cutoff
 * day / HR offset+window as editable constants. A functionNode computes the
 * visit count formula for the branch, the per-index scheduled date, and
 * whether the cutoff drops it.
 *
 * Input contract (one call per candidate visit index, mode selects formula):
 *   mode: 'PLAN' | 'CHAINED' | 'HR'
 *   PLAN: dob, registrationDate — returns { branch, visitCount, inc1Date }
 *   CHAINED: dob, previousScheduledDate, sequenceNo, localScheduleUuid,
 *            previousVisitLocalUuid? — returns { scheduleRows } (empty if
 *            the computed date exceeds the hard cutoff — dropped, not
 *            marked missed, per SRS)
 *   HR: dob, actualCompletionDate, sequenceNo, localScheduleUuid,
 *       triggeringVisitLocalUuid? — returns { scheduleRows }
 */
export const INC_DECISION_GRAPH = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'constants1',
      type: 'decisionTableNode',
      name: 'incConstants',
      position: { x: 150, y: 0 },
      content: {
        hitPolicy: 'first',
        passThrough: true,
        inputs: [
          { id: 'i1', field: 'mode', name: 'mode', type: 'expression' },
          {
            id: 'i2',
            field: 'registrationDaysFromDob',
            name: 'registrationDaysFromDob',
            type: 'expression',
          },
        ],
        outputs: [
          { id: 'o1', field: 'branch', name: 'branch', type: 'expression' },
          {
            id: 'o2',
            field: 'inc1AnchorOffsetDays',
            name: 'inc1AnchorOffsetDays',
            type: 'expression',
          },
          { id: 'o3', field: 'chainIntervalDays', name: 'chainIntervalDays', type: 'expression' },
          { id: 'o4', field: 'chainWindowDays', name: 'chainWindowDays', type: 'expression' },
          {
            id: 'o5',
            field: 'hardCutoffDaysFromDob',
            name: 'hardCutoffDaysFromDob',
            type: 'expression',
          },
          { id: 'o6', field: 'hrOffsetDays', name: 'hrOffsetDays', type: 'expression' },
          { id: 'o7', field: 'hrWindowDays', name: 'hrWindowDays', type: 'expression' },
          { id: 'o8', field: 'neonatalPeriodDays', name: 'neonatalPeriodDays', type: 'expression' },
          { id: 'o9', field: 'yearDays', name: 'yearDays', type: 'expression' },
        ],
        rules: [
          {
            i1: "'PLAN'",
            i2: '[0..58]',
            o1: "'early'",
            o2: '58',
            o3: '30',
            o4: '5',
            o5: '370',
            o6: '',
            o7: '',
            o8: '58',
            o9: '365',
          },
          {
            i1: "'PLAN'",
            i2: '',
            o1: "'late'",
            o2: '',
            o3: '30',
            o4: '5',
            o5: '370',
            o6: '',
            o7: '',
            o8: '58',
            o9: '365',
          },
          {
            i1: "'CHAINED'",
            i2: '',
            o1: '',
            o2: '',
            o3: '30',
            o4: '5',
            o5: '370',
            o6: '',
            o7: '',
            o8: '',
            o9: '',
          },
          {
            i1: "'HR'",
            i2: '',
            o1: '',
            o2: '',
            o3: '',
            o4: '',
            o5: '',
            o6: '15',
            o7: '2',
            o8: '',
            o9: '',
          },
        ],
      },
    },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computeInc',
      position: { x: 350, y: 0 },
      content: `const handler = (input, { dayjs }) => {
        const toIso = (d) => d.format('YYYY-MM-DD');
        const dob = dayjs(input.dob);

        if (input.mode === 'PLAN') {
          if (input.branch === 'early') {
            // Round(Total days in a year - neonatal period) / 30, INC1 anchor = DOB+58.
            const visitCount = Math.round((input.yearDays - input.neonatalPeriodDays) / 30);
            return {
              branch: 'early',
              visitCount,
              inc1Date: toIso(dob.add(input.inc1AnchorOffsetDays, 'day')),
            };
          }
          // Late: INC1 = registration date itself; count = additional visits after INC1.
          const registrationDate = dob.add(input.registrationDaysFromDob, 'day');
          const visitCount = Math.round(
            (input.yearDays - input.registrationDaysFromDob) / 30,
          );
          return {
            branch: 'late',
            visitCount,
            inc1Date: toIso(registrationDate),
          };
        }

        if (input.mode === 'CHAINED') {
          const previous = dayjs(input.previousScheduledDate);
          const scheduledDate = previous.add(input.chainIntervalDays, 'day');
          const cutoff = dob.add(input.hardCutoffDaysFromDob, 'day');
          // Hard cutoff: any INC visit beyond DOB+370 is dropped, not generated,
          // not marked missed.
          if (scheduledDate.isAfter(cutoff)) {
            return { scheduleRows: [], droppedByCutoff: true };
          }
          return {
            scheduleRows: [{
              localScheduleUuid: input.localScheduleUuid,
              visitCode: 'INC' + input.sequenceNo,
              visitType: 'INC',
              sequenceNo: input.sequenceNo,
              scheduledDate: toIso(scheduledDate),
              windowStartDate: toIso(scheduledDate.subtract(input.chainWindowDays, 'day')),
              windowEndDate: toIso(scheduledDate.add(input.chainWindowDays, 'day')),
              anchorType: 'DOB',
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
              visitCode: 'INC_HR',
              visitType: 'INC_HR',
              sequenceNo: input.sequenceNo,
              scheduledDate: toIso(scheduledDate),
              windowStartDate: toIso(scheduledDate.subtract(input.hrWindowDays, 'day')),
              windowEndDate: toIso(scheduledDate.add(input.hrWindowDays, 'day')),
              anchorType: 'ACTUAL_VISIT',
              anchorVisitLocalUuid: input.triggeringVisitLocalUuid ?? null,
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
