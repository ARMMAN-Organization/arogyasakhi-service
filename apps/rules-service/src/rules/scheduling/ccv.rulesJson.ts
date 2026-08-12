/**
 * CCV (13-24 month) visit-schedule decision graph (SRS §3A.2.3 "CCV Visit
 * Schedule", Appendix A.5, BR-13).
 *
 * BR-13: risk state is evaluated exactly once, at the 12-month INC-to-CCV
 * transition, from the last 3 completed INC visits (plus a full 0-12m scan
 * for "was HR ever detected"). No re-evaluation happens within 13-24m - so
 * this pack takes the already-computed scan/last-3 signals as input and is
 * safe to call multiple times with the same input for the same idempotent
 * result; it does not itself re-derive risk state from raw visit history.
 *
 * Five states (Appendix A.5):
 *  - NEVER_AT_HR            - no HR ever detected in 0-12m.
 *  - CURRENTLY_HR_SAM       - SAM/danger sign at most recent INC visit.
 *  - CURRENTLY_HR_OTHER     - other HR condition at most recent INC visit.
 *  - RECENTLY_RECOVERED     - HR detected earlier, but last 3 INC visits normal.
 *  - STABLE_LOW_RISK        - last 3 INC visits normal AND fully immunised,
 *                             normal growth (never at risk historically is
 *                             NEVER_AT_HR; this state is "no risk in last 3,
 *                             and never any risk signal beyond that scan").
 *
 * Cadence differs for 13-18m and 19-24m sub-periods (Appendix A.5 table).
 *
 * Program exit (Appendix A.5 "Program exit"): at DOB+730 the journey ends
 * unless the *last* CCV visit detected HR, in which case one CCV-HR visit
 * is generated 30 days later and the journey extends to ~25 months, with
 * closure deferred until that CCV-HR visit completes (closure form
 * triggering itself is a separate CLOSURE rule pack, out of scope here -
 * this pack only reports whether the extension visit is required).
 */
export const ccvRulesJson = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computeCcvSchedule',
      position: { x: 200, y: 0 },
      content: `
const handler = (input, { dayjs }) => {
  const {
    dob,
    hrEverDetectedIn0to12m,
    mostRecentIncVisitHrType, // 'SAM_DANGER' | 'OTHER' | 'NONE'
    last3IncVisitsNormal,     // boolean
    hrDetectedAtLastCcvVisit, // boolean, evaluated by the caller at DOB+730
  } = input;

  const dobDate = dayjs(dob);

  let riskState;
  let cadence13to18MonthsEveryNMonths;
  let cadence19to24MonthsEveryNMonths;

  if (!hrEverDetectedIn0to12m) {
    riskState = 'NEVER_AT_HR';
    cadence13to18MonthsEveryNMonths = 2;
    cadence19to24MonthsEveryNMonths = 2;
  } else if (mostRecentIncVisitHrType === 'SAM_DANGER') {
    riskState = 'CURRENTLY_HR_SAM';
    cadence13to18MonthsEveryNMonths = 1; // "HR visit in 30 days, every detection"
    cadence19to24MonthsEveryNMonths = 1;
  } else if (mostRecentIncVisitHrType === 'OTHER') {
    riskState = 'CURRENTLY_HR_OTHER';
    cadence13to18MonthsEveryNMonths = 1;
    cadence19to24MonthsEveryNMonths = 1;
  } else if (last3IncVisitsNormal) {
    // HR was detected earlier (this branch only reached when
    // hrEverDetectedIn0to12m is true), the last 3 INC visits are normal, and
    // the most recent visit itself is not HR - Recently Recovered per
    // Appendix A.5 (SRS lines 1557-1559: "HR detected earlier but last 3
    // INC visits normal"), matching this file's own top-of-file docstring.
    // (Appendix A.5's line 355 summary table states this state's condition
    // the other way around - contradicts its own line 1557-1559 table; the
    // latter is treated as authoritative here.)
    riskState = 'RECENTLY_RECOVERED';
    cadence13to18MonthsEveryNMonths = 1;
    cadence19to24MonthsEveryNMonths = 2;
  } else {
    // GAP: HR was detected earlier, the most recent visit itself is not HR,
    // but the last 3 INC visits are still not all normal. Appendix A.5's
    // five-state model (SRS lines 350-356 / 1557-1559) does not define a
    // distinct condition for this combination - both named non-HR states
    // (Recently Recovered, Stable Low Risk) require last3IncVisitsNormal to
    // be true. Falling through to Stable Low Risk's cadence here is
    // provisional pending SRS/product clarification (flagged in PR #129
    // review) - do not treat this as validated clinical behaviour.
    riskState = 'STABLE_LOW_RISK';
    cadence13to18MonthsEveryNMonths = 2;
    cadence19to24MonthsEveryNMonths = 2;
  }

  const transitionDate = dobDate.add(365, 'day');
  const programExitDate = dobDate.add(730, 'day');

  const visits = [];
  let cursor = transitionDate;
  let visitIndex = 1;
  while (cursor.isBefore(programExitDate) || cursor.isSame(programExitDate)) {
    const monthsSinceDob = cursor.diff(dobDate, 'month');
    const cadenceMonths =
      monthsSinceDob < 19 ? cadence13to18MonthsEveryNMonths : cadence19to24MonthsEveryNMonths;
    visits.push({
      visitName: 'CCV' + visitIndex,
      scheduledDate: cursor.format('YYYY-MM-DD'),
      windowOpen: cursor.subtract(5, 'day').format('YYYY-MM-DD'),
      windowClose: cursor.add(5, 'day').format('YYYY-MM-DD'),
    });
    visitIndex++;
    cursor = cursor.add(cadenceMonths, 'month');
  }

  // Program exit / CCV-HR extension (Appendix A.5 "Program exit").
  let extensionVisit = null;
  let closureDeferredForExtension = false;
  if (hrDetectedAtLastCcvVisit) {
    const lastVisit = visits[visits.length - 1];
    const lastVisitDate = lastVisit ? dayjs(lastVisit.scheduledDate) : programExitDate;
    const extensionDate = lastVisitDate.add(30, 'day');
    extensionVisit = {
      visitName: 'CCV-HR',
      scheduledDate: extensionDate.format('YYYY-MM-DD'),
      windowOpen: extensionDate.subtract(5, 'day').format('YYYY-MM-DD'),
      windowClose: extensionDate.add(5, 'day').format('YYYY-MM-DD'),
    };
    closureDeferredForExtension = true;
  }

  return {
    riskState,
    cadence13to18MonthsEveryNMonths,
    cadence19to24MonthsEveryNMonths,
    visits,
    extensionVisit,
    closureDeferredForExtension,
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
