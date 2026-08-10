/**
 * INC (0-12 month) visit-schedule decision graph (SRS §3A.2.3 "INC Visit
 * Schedule", Appendix A.4, BR-02, BR-12).
 *
 * Two-formula approach keyed on the Day 58 boundary (inclusive on both
 * sides per "Early registration (Day 0 to Day 58 from DOB)"):
 *  - Early registration: 11 fixed visits, INC1 anchored at DOB+58, chained
 *    every 30 days.
 *  - Late registration: INC1 = registration date itself; additional visit
 *    count = floor((365 - (registrationDate - DOB)) / 30), chained every
 *    30 days from INC1.
 *
 * Hard cutoff (BR-12): any visit scheduled beyond DOB+370 is dropped -
 * silently excluded from the output, never marked missed.
 *
 * BR-02: fixed at registration/enrolment, does not shift on missed visits -
 * this pack is stateless/pure (dob + registrationDate only), so it cannot
 * drift; re-running it always reproduces the same schedule.
 */
export const incRulesJson = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computeIncSchedule',
      position: { x: 200, y: 0 },
      content: `
const handler = (input, { dayjs }) => {
  const dob = dayjs(input.dob);
  const reg = dayjs(input.registrationDate);
  const daysSinceDob = reg.diff(dob, 'day');
  const cutoff = dob.add(370, 'day');

  let registrationCategory;
  let anchor;
  let additionalVisitCount;

  if (daysSinceDob <= 58) {
    // Early registration: 11 visits fixed, INC1 = DOB + 58.
    registrationCategory = 'EARLY';
    anchor = dob.add(58, 'day');
    additionalVisitCount = 10; // INC2..INC11
  } else {
    // Late registration: INC1 = registration date itself.
    registrationCategory = 'LATE';
    anchor = reg;
    additionalVisitCount = Math.floor((365 - daysSinceDob) / 30);
  }

  const rawVisits = [];
  rawVisits.push({ visitName: 'INC1', scheduledDate: anchor });
  for (let i = 1; i <= additionalVisitCount; i++) {
    rawVisits.push({ visitName: 'INC' + (i + 1), scheduledDate: anchor.add(i * 30, 'day') });
  }

  const droppedVisits = [];
  const visits = [];
  for (const v of rawVisits) {
    if (v.scheduledDate.isAfter(cutoff)) {
      droppedVisits.push(v.visitName);
      continue;
    }
    visits.push({
      visitName: v.visitName,
      scheduledDate: v.scheduledDate.format('YYYY-MM-DD'),
      windowOpen: v.scheduledDate.subtract(5, 'day').format('YYYY-MM-DD'),
      windowClose: v.scheduledDate.add(5, 'day').format('YYYY-MM-DD'),
    });
  }

  return {
    registrationCategory,
    visits,
    droppedVisits,
    lastIncVisitDate: visits.length > 0 ? visits[visits.length - 1].scheduledDate : null,
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
