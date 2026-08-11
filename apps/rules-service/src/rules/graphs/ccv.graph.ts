/**
 * CCV (Child Care Visit, 13–24 months / "1000 Days") decision graph — SRS
 * v3.0 §3A.2.3 "CCV Visit Schedule". Per the SRS's own recommendation, app
 * scheduling happens at the INC-to-CCV transition (not at registration) using
 * the actual risk state from the last 3 completed 0–12m INC visits — this
 * graph implements that transition-time evaluation plus the resulting
 * cadence and CCV-HR/CCV visit generation. The registration-time 6-visit
 * projected schedule is a dashboard/forecasting concern, explicitly out of
 * scope here (reporting feature, not app scheduling).
 *
 * A decisionTableNode holds the 5-row risk-state table (Never-at-HR /
 * Currently-HR-SAM / Currently-HR-Other / Recently-Recovered / Stable-Low)
 * mapping input flags to the 13–18m and 19–24m cadence-in-months constants.
 * A second decisionTableNode holds CCV-HR/program-exit constants. A
 * functionNode computes the risk state's chosen cadence for a given
 * candidate visit, or the CCV-HR/exit dates.
 *
 * Input contract:
 *   mode: 'RISK_STATE' | 'CADENCE' | 'HR' | 'EXIT'
 *   RISK_STATE: hadAnyHrInLast12m, mostRecentHasSamOrDangerSign,
 *     mostRecentHasOtherHr, last3AllAtRisk, last3AllNormalFullyImmunised
 *     -> { riskState, cadence18mMonths, cadence24mMonths }
 *   CADENCE: previousScheduledDate, ageInMonths, cadenceMonths, sequenceNo,
 *     localScheduleUuid, anchorVisitLocalUuid? -> { scheduleRows }
 *   HR: actualDetectionDate, sequenceNo, localScheduleUuid,
 *     triggeringVisitLocalUuid? -> { scheduleRows } (single-instance per
 *     detection — SRS: "even if triggered before")
 *   EXIT: dob, hrAtLastVisit -> { exitDate, extendedByHr }
 */
export const CCV_DECISION_GRAPH = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'riskTable1',
      type: 'decisionTableNode',
      name: 'ccvRiskStateTable',
      position: { x: 150, y: -80 },
      content: {
        hitPolicy: 'first',
        passThrough: true,
        inputs: [
          {
            id: 'i1',
            field: 'mostRecentHasSamOrDangerSign',
            name: 'mostRecentHasSamOrDangerSign',
            type: 'expression',
          },
          {
            id: 'i2',
            field: 'mostRecentHasOtherHr',
            name: 'mostRecentHasOtherHr',
            type: 'expression',
          },
          { id: 'i3', field: 'hadAnyHrInLast12m', name: 'hadAnyHrInLast12m', type: 'expression' },
          { id: 'i4', field: 'last3AllAtRisk', name: 'last3AllAtRisk', type: 'expression' },
          {
            id: 'i5',
            field: 'last3AllNormalFullyImmunised',
            name: 'last3AllNormalFullyImmunised',
            type: 'expression',
          },
        ],
        outputs: [
          { id: 'o1', field: 'riskState', name: 'riskState', type: 'expression' },
          { id: 'o2', field: 'cadence18mMonths', name: 'cadence18mMonths', type: 'expression' },
          { id: 'o3', field: 'cadence24mMonths', name: 'cadence24mMonths', type: 'expression' },
        ],
        rules: [
          {
            i1: 'true',
            i2: '',
            i3: '',
            i4: '',
            i5: '',
            o1: "'CURRENTLY_HR_SAM_DANGER'",
            o2: '1',
            o3: '1',
          },
          {
            i1: '',
            i2: 'true',
            i3: '',
            i4: '',
            i5: '',
            o1: "'CURRENTLY_HR_OTHER'",
            o2: '1',
            o3: '1',
          },
          { i1: '', i2: '', i3: 'false', i4: '', i5: '', o1: "'NEVER_AT_HR'", o2: '2', o3: '2' },
          {
            i1: '',
            i2: '',
            i3: '',
            i4: 'true',
            i5: '',
            o1: "'RECENTLY_RECOVERED'",
            o2: '1',
            o3: '2',
          },
          {
            i1: '',
            i2: '',
            i3: '',
            i4: '',
            i5: 'true',
            o1: "'STABLE_LOW_RISK'",
            o2: '2',
            o3: '2',
          },
        ],
      },
    },
    {
      id: 'constTable1',
      type: 'decisionTableNode',
      name: 'ccvConstants',
      position: { x: 150, y: 80 },
      content: {
        hitPolicy: 'first',
        passThrough: true,
        inputs: [{ id: 'i1', field: 'mode', name: 'mode', type: 'expression' }],
        outputs: [
          { id: 'o1', field: 'windowDays', name: 'windowDays', type: 'expression' },
          { id: 'o2', field: 'hrOffsetDays', name: 'hrOffsetDays', type: 'expression' },
          { id: 'o3', field: 'hrWindowDays', name: 'hrWindowDays', type: 'expression' },
          {
            id: 'o4',
            field: 'programExitDaysFromDob',
            name: 'programExitDaysFromDob',
            type: 'expression',
          },
        ],
        rules: [
          { i1: "'CADENCE'", o1: '5', o2: '', o3: '', o4: '' },
          { i1: "'HR'", o1: '', o2: '30', o3: '5', o4: '' },
          { i1: "'EXIT'", o1: '', o2: '30', o3: '', o4: '730' },
        ],
      },
    },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computeCcv',
      position: { x: 400, y: 0 },
      content: `const handler = (input, { dayjs }) => {
        const toIso = (d) => d.format('YYYY-MM-DD');

        if (input.mode === 'RISK_STATE') {
          return {
            riskState: input.riskState,
            cadence18mMonths: input.cadence18mMonths,
            cadence24mMonths: input.cadence24mMonths,
          };
        }

        if (input.mode === 'CADENCE') {
          const previous = dayjs(input.previousScheduledDate);
          const scheduledDate = previous.add(input.cadenceMonths, 'month');
          return {
            scheduleRows: [{
              localScheduleUuid: input.localScheduleUuid,
              visitCode: 'CCV' + input.sequenceNo,
              visitType: 'CCV',
              sequenceNo: input.sequenceNo,
              scheduledDate: toIso(scheduledDate),
              windowStartDate: toIso(scheduledDate.subtract(input.windowDays, 'day')),
              windowEndDate: toIso(scheduledDate.add(input.windowDays, 'day')),
              anchorType: 'CCV_TRANSITION',
              anchorVisitLocalUuid: input.anchorVisitLocalUuid ?? null,
            }],
          };
        }

        if (input.mode === 'HR') {
          // Single-instance per detection: a fresh CCV-HR is generated every
          // time an HR condition is detected, even for a condition that
          // triggered one before (SRS explicit note) — no dedup here.
          const detection = dayjs(input.actualDetectionDate);
          const scheduledDate = detection.add(input.hrOffsetDays, 'day');
          return {
            scheduleRows: [{
              localScheduleUuid: input.localScheduleUuid,
              visitCode: 'CCV_HR',
              visitType: 'CCV_HR',
              sequenceNo: input.sequenceNo,
              scheduledDate: toIso(scheduledDate),
              windowStartDate: toIso(scheduledDate.subtract(input.hrWindowDays, 'day')),
              windowEndDate: toIso(scheduledDate.add(input.hrWindowDays, 'day')),
              anchorType: 'ACTUAL_VISIT',
              anchorVisitLocalUuid: input.triggeringVisitLocalUuid ?? null,
            }],
          };
        }

        if (input.mode === 'EXIT') {
          const dob = dayjs(input.dob);
          const baseExit = dob.add(input.programExitDaysFromDob, 'day');
          if (!input.hrAtLastVisit) {
            return { exitDate: toIso(baseExit), extendedByHr: false };
          }
          // HR at last CCV visit: journey extends, one more CCV-HR 30 days
          // later, closure at ~25 months (exit = 24m mark + HR offset).
          return { exitDate: toIso(baseExit.add(input.hrOffsetDays, 'day')), extendedByHr: true };
        }

        return { scheduleRows: [] };
      };`,
    },
    { id: 'output1', type: 'outputNode', name: 'response', position: { x: 600, y: 0 } },
  ],
  edges: [
    { id: 'e1', sourceId: 'input1', targetId: 'riskTable1', type: 'edge' },
    { id: 'e2', sourceId: 'riskTable1', targetId: 'constTable1', type: 'edge' },
    { id: 'e3', sourceId: 'constTable1', targetId: 'fn1', type: 'edge' },
    { id: 'e4', sourceId: 'fn1', targetId: 'output1', type: 'edge' },
  ],
};
