/**
 * Neonatal (NN) visit-schedule decision graph (SRS §3A.2.3 "NN Visit
 * Schedule" Scenarios A/B/C, Appendix A.3, Appendix G.2 late-delivery-form
 * table, BR-06/SR-NN-01).
 *
 * Three day-buckets based on how many days after delivery the delivery form
 * was filled:
 *  - Day 0-14  (Scenario A): NN1 same session, window 0-14. NN2 generated
 *    after NN1 completion, window 15-28.
 *  - Day 15-28 (Scenario B / Appendix G.2 row 2): NN1 skipped (window
 *    already closed - not generated, not marked missed). NN2 generated
 *    immediately, window = remaining days up to Day 28.
 *  - Day 29+   (Appendix G.2 row 3, the case omitted from the first draft
 *    of this pack): no neonatal section at all. Both NN1 and NN2 are
 *    skipped; the child goes directly to INC scheduling.
 *
 * SR-NN-01 / BR-06: no HR visits during the neonatal phase - this pack's
 * output schema has no HR-related field by construction; a critical
 * condition detected during NN1/NN2 goes through the referral flow, which
 * is a separate rule category (out of scope here).
 */
export const nnRulesJson = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computeNnSchedule',
      position: { x: 200, y: 0 },
      content: `
const handler = (input, { dayjs }) => {
  const delivery = dayjs(input.deliveryDate);
  const filled = dayjs(input.deliveryFormFiledDate);
  const daysSinceDelivery = filled.diff(delivery, 'day');

  if (daysSinceDelivery <= 14) {
    // Scenario A / Appendix G.2 row 1.
    return {
      scenario: 'DAY_0_TO_14',
      neonatalPhaseApplies: true,
      nn1: {
        visitName: 'NN1',
        scheduledDate: delivery.format('YYYY-MM-DD'),
        windowOpen: delivery.format('YYYY-MM-DD'),
        windowClose: delivery.add(14, 'day').format('YYYY-MM-DD'),
      },
      nn2: {
        visitName: 'NN2',
        scheduledDate: delivery.add(15, 'day').format('YYYY-MM-DD'),
        windowOpen: delivery.add(15, 'day').format('YYYY-MM-DD'),
        windowClose: delivery.add(28, 'day').format('YYYY-MM-DD'),
      },
    };
  }

  if (daysSinceDelivery <= 28) {
    // Scenario B / Appendix G.2 row 2 - NN1 skipped, NN2 immediate.
    return {
      scenario: 'DAY_15_TO_28',
      neonatalPhaseApplies: true,
      nn1: null,
      nn2: {
        visitName: 'NN2',
        scheduledDate: filled.format('YYYY-MM-DD'),
        windowOpen: filled.format('YYYY-MM-DD'),
        windowClose: delivery.add(28, 'day').format('YYYY-MM-DD'),
      },
    };
  }

  // Day 29+ / Appendix G.2 row 3 - no neonatal section, straight to INC.
  return {
    scenario: 'DAY_29_PLUS',
    neonatalPhaseApplies: false,
    nn1: null,
    nn2: null,
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
