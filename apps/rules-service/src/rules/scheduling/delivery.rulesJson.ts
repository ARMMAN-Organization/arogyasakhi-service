/**
 * Delivery combined-visit orchestration decision graph (SRS Appendix G).
 * Not one of the six journeys named in the task, but required for the ANC/
 * PP/NN/INC/CCV packs to actually reflect the document: the delivery form
 * submission is the event that decides WHICH of those schedules to invoke
 * and with what starting parameters, per Appendix G. This pack answers
 * "what should happen as a result of this delivery form submission" -
 * generating each child/mother sub-schedule is still delegated to the
 * anc/pp/nn/inc rulesJson packs, called by the service layer using this
 * pack's output as a plan.
 *
 * G.1: ANC-enrolled mother -> lapse all open ANC visits (schedule-visibility
 * signal only; the actual DB write is a service-layer action, same
 * boundary as the ANC pack's `deliveryFormFiledByEddPlus7`), generate PP
 * (PP1 already done same session -> PP2-5), NN, INC per child.
 * G.4: stillbirth -> mother still gets full PP1-5, but NO child schedule
 * (NN/INC/CCV) is initiated at all.
 * G.5: multiple births -> independent NN/INC/CCV schedule per child; PP is
 * mother-level, generated once regardless of child count.
 * G.2: late delivery form auto-determines PP/NN sections shown - delegated
 * to the NN pack's own day-bucket logic (this pack just confirms neonatal
 * applicability per child via that same day-bucket signal).
 */
export const deliveryRulesJson = {
  contentType: 'application/vnd.gorules.decision',
  nodes: [
    { id: 'input1', type: 'inputNode', name: 'request', position: { x: 0, y: 0 } },
    {
      id: 'fn1',
      type: 'functionNode',
      name: 'computeDeliveryPlan',
      position: { x: 200, y: 0 },
      content: `
const handler = (input, { dayjs }) => {
  const {
    deliveryOutcome,       // 'LIVE_BIRTH' | 'STILLBIRTH'
    motherEnrollmentType,  // 'ANC_ENROLLED' | 'DIRECT'
    numberOfChildren,
    deliveryDate,
    deliveryFormFiledDate,
  } = input;

  if (deliveryOutcome !== 'LIVE_BIRTH' && deliveryOutcome !== 'STILLBIRTH') {
    throw new Error("deliveryOutcome must be 'LIVE_BIRTH' or 'STILLBIRTH'.");
  }

  const daysSinceDelivery = dayjs(deliveryFormFiledDate).diff(dayjs(deliveryDate), 'day');

  const motherPlan = {
    // PP1 is filled in the same combined session as the delivery form
    // (G.1); the PP pack still generates all 5 rows from deliveryDate, the
    // caller simply does not re-present PP1 to the Sakhi.
    generatePpSchedule: true,
    ppScheduleStartsFrom: motherEnrollmentType === 'ANC_ENROLLED' ? 'PP2' : 'PP1',
    lapseOpenAncVisits: motherEnrollmentType === 'ANC_ENROLLED',
  };

  // G.4: stillbirth - mother still gets full PP1-5, no child journey at all.
  if (deliveryOutcome === 'STILLBIRTH') {
    return {
      motherPlan: { ...motherPlan, ppScheduleStartsFrom: 'PP1' },
      childPlans: [],
      neonatalPhaseAppliesGlobally: false,
    };
  }

  // G.5: one independent plan per live-born child.
  const neonatalPhaseApplies = daysSinceDelivery <= 28;
  const childPlans = [];
  for (let i = 0; i < numberOfChildren; i++) {
    childPlans.push({
      childIndex: i,
      generateNnSchedule: neonatalPhaseApplies,
      generateIncSchedule: true,
      // CCV schedule is generated later, at the INC-to-CCV transition
      // (ccv.rulesJson.ts) - not at delivery time.
    });
  }

  return {
    motherPlan,
    childPlans,
    neonatalPhaseAppliesGlobally: neonatalPhaseApplies,
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
