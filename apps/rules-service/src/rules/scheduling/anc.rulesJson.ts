/**
 * ANC visit-schedule decision graph (SRS §3A.2.3 "ANC Visit Schedule",
 * Appendix A.1, Appendix B, BR-01/BR-08). A single gorules function node
 * computing the full formula-driven, uncapped ANC schedule from
 * registrationDate/edd — stateless and pure, so re-running it with a new
 * `edd` after a Supervisor-approved LMP/EDD change (BR-01) IS the
 * regeneration; no separate "regenerate" rule exists.
 *
 * Does not decide whether the delivery form has actually lapsed the open
 * ANC visits (FR-S-3.7/BR-04/G.3) — that is a DB-state mutation the calling
 * service performs; this pack only reports `deliveryFormFiledByEddPlus7`
 * so the caller knows whether the Post-EDD visit applies.
 */
export const ancRulesJson = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computeAncSchedule',
      position: { x: 200, y: 0 },
      content: `
const handler = (input, { dayjs }) => {
  const { registrationDate, edd, deliveryFormFiledDate } = input;
  const reg = dayjs(registrationDate);
  const eddDate = dayjs(edd);

  // FR-S-3.1 / Appendix A.1: ((EDD - Registration date) / 30) + 1, uncapped.
  const totalVisits = Math.round(eddDate.diff(reg, 'day') / 30) + 1;

  const visits = [];
  // FR-S-3.2: ANC1 on Day 0 (registration date). Window Day 0 to +5.
  visits.push({
    visitName: 'ANC1',
    scheduledDate: reg.format('YYYY-MM-DD'),
    windowOpen: reg.format('YYYY-MM-DD'),
    windowClose: reg.add(5, 'day').format('YYYY-MM-DD'),
  });

  // FR-S-3.3: ANC2..ANCn every 30 days from the previous scheduled date, +/-5 day window.
  for (let i = 2; i <= totalVisits; i++) {
    const scheduled = reg.add((i - 1) * 30, 'day');
    visits.push({
      visitName: 'ANC' + i,
      scheduledDate: scheduled.format('YYYY-MM-DD'),
      windowOpen: scheduled.subtract(5, 'day').format('YYYY-MM-DD'),
      windowClose: scheduled.add(5, 'day').format('YYYY-MM-DD'),
    });
  }

  // SR-ANC-01 / BR-08: if delivery form not filed by EDD+7, generate a dynamically
  // named ANC(n+1) visit on EDD+8, window EDD+8 to EDD+13.
  const deliveryFiledByEddPlus7 =
    !!deliveryFormFiledDate && !dayjs(deliveryFormFiledDate).isAfter(eddDate.add(7, 'day'));
  let postEddVisit = null;
  if (!deliveryFiledByEddPlus7) {
    const postEddDate = eddDate.add(8, 'day');
    postEddVisit = {
      visitName: 'ANC' + (totalVisits + 1),
      scheduledDate: postEddDate.format('YYYY-MM-DD'),
      windowOpen: postEddDate.format('YYYY-MM-DD'),
      windowClose: eddDate.add(13, 'day').format('YYYY-MM-DD'),
    };
  }

  return {
    totalRegularVisits: totalVisits,
    visits,
    postEddVisit,
    deliveryFormFiledByEddPlus7: deliveryFiledByEddPlus7,
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
