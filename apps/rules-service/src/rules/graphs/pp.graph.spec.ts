import { runDecisionGraph } from '../ruleSet.evaluator';
import { PP_DECISION_GRAPH } from './pp.graph';

describe('PP_DECISION_GRAPH', () => {
  const evalPp = (visitCode: string) =>
    runDecisionGraph(PP_DECISION_GRAPH, {
      visitCode,
      deliveryDate: '2026-08-11',
      localScheduleUuid: `${visitCode.toLowerCase()}-uuid`,
    }) as Promise<{ scheduleRows: Array<Record<string, unknown>> }>;

  it('PP1: Day 0, window [Day0, Day+14]', async () => {
    const result = await evalPp('PP1');
    expect(result.scheduleRows[0]).toMatchObject({
      sequenceNo: 1,
      scheduledDate: '2026-08-11',
      windowStartDate: '2026-08-11',
      windowEndDate: '2026-08-25',
    });
  });

  it('PP2: Day +15, window [Day+15, Day+28]', async () => {
    const result = await evalPp('PP2');
    expect(result.scheduleRows[0]).toMatchObject({
      sequenceNo: 2,
      scheduledDate: '2026-08-26',
      windowStartDate: '2026-08-26',
      windowEndDate: '2026-09-08',
    });
  });

  it('PP3: Day +58, window [Day+53, Day+63]', async () => {
    const result = await evalPp('PP3');
    expect(result.scheduleRows[0]).toMatchObject({
      sequenceNo: 3,
      scheduledDate: '2026-10-08',
      windowStartDate: '2026-10-03',
      windowEndDate: '2026-10-13',
    });
  });

  it('PP4: Day +88, window [Day+83, Day+93]', async () => {
    const result = await evalPp('PP4');
    expect(result.scheduleRows[0]).toMatchObject({
      sequenceNo: 4,
      scheduledDate: '2026-11-07',
      windowStartDate: '2026-11-02',
      windowEndDate: '2026-11-12',
    });
  });

  it('PP5: Day +105, window [Day+113, Day+123] exactly as written in the SRS (window opens after the scheduled date)', async () => {
    const result = await evalPp('PP5');
    expect(result.scheduleRows[0]).toMatchObject({
      sequenceNo: 5,
      scheduledDate: '2026-11-24',
      windowStartDate: '2026-12-02',
      windowEndDate: '2026-12-12',
    });
  });

  it('every PP row anchors on DELIVERY_DATE with visitType PP', async () => {
    const result = await evalPp('PP1');
    expect(result.scheduleRows[0]).toMatchObject({ visitType: 'PP', anchorType: 'DELIVERY_DATE' });
  });
});
