/**
 * Postpartum (PP) visit-schedule decision graph (SRS §3A.2.3 "PP Visit
 * Schedule", Appendix A.2, BR-05). Fixed 5-row table anchored strictly to
 * `deliveryDate` — the input schema deliberately has no "actual completion
 * date" field, so PP3-5 cannot shift on a late PP2 completion (BR-05: "If
 * PP2 completed late, PP3 stays at Day 45").
 *
 * This is visit-SCHEDULE timing only. There is no PP-phase RISK grading
 * pack yet (contrast anc-risk.rulesJson.ts / infant-risk.rulesJson.ts).
 * Issue #191 confirmed PP HR grading is in scope — using the PP_VISIT
 * form's own fields (danger signs, bleeding, fever, foul discharge, wound
 * infection, pallor, dehydration, BP, Hb, blood glucose, BMI, MUAC,
 * referral flag, maternal risk flag) against the HR Protocol Developer's
 * Copy — but the pack itself is not yet built. Do not add PP risk grading
 * here; it belongs in its own pp-risk.rulesJson.ts, mirroring
 * anc-risk.rulesJson.ts's structure.
 */
export const ppRulesJson = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computePpSchedule',
      position: { x: 200, y: 0 },
      content: `
const handler = (input, { dayjs }) => {
  const delivery = dayjs(input.deliveryDate);

  // Appendix A.2 — fixed offsets from delivery date, fixed window offsets.
  const rows = [
    { visitName: 'PP1', scheduledOffset: 0, windowOpenOffset: 0, windowCloseOffset: 14 },
    { visitName: 'PP2', scheduledOffset: 15, windowOpenOffset: 15, windowCloseOffset: 28 },
    { visitName: 'PP3', scheduledOffset: 58, windowOpenOffset: 53, windowCloseOffset: 63 },
    { visitName: 'PP4', scheduledOffset: 88, windowOpenOffset: 83, windowCloseOffset: 93 },
    { visitName: 'PP5', scheduledOffset: 118, windowOpenOffset: 113, windowCloseOffset: 123 },
  ];

  const visits = rows.map((r) => ({
    visitName: r.visitName,
    scheduledDate: delivery.add(r.scheduledOffset, 'day').format('YYYY-MM-DD'),
    windowOpen: delivery.add(r.windowOpenOffset, 'day').format('YYYY-MM-DD'),
    windowClose: delivery.add(r.windowCloseOffset, 'day').format('YYYY-MM-DD'),
  }));

  return { visits };
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
