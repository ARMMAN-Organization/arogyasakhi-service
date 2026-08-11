import { runDecisionGraph } from '../ruleSet.evaluator';
import { NN_DECISION_GRAPH } from './nn.graph';

describe('NN_DECISION_GRAPH', () => {
  it('Scenario A: filled Day 0-14 -> NN1 same day [0,14], NN2 [15,28]', async () => {
    const result = (await runDecisionGraph(NN_DECISION_GRAPH, {
      deliveryDate: '2026-08-11',
      deliveryFormFilledDay: 0,
      localScheduleUuid1: 'nn1-uuid',
      localScheduleUuid2: 'nn2-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };

    expect(result.scheduleRows).toHaveLength(2);
    expect(result.scheduleRows[0]).toMatchObject({
      visitCode: 'NN1',
      scheduledDate: '2026-08-11',
      windowStartDate: '2026-08-11',
      windowEndDate: '2026-08-25',
    });
    expect(result.scheduleRows[1]).toMatchObject({
      visitCode: 'NN2',
      scheduledDate: '2026-08-26',
      windowStartDate: '2026-08-26',
      windowEndDate: '2026-09-08',
    });
  });

  it('Scenario B: filled Day 15-27 -> NN1 skipped (not generated), NN2 immediate window [fillDay,28]', async () => {
    const result = (await runDecisionGraph(NN_DECISION_GRAPH, {
      deliveryDate: '2026-08-11',
      deliveryFormFilledDay: 20,
      localScheduleUuid1: 'nn1-uuid',
      localScheduleUuid2: 'nn2-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };

    expect(result.scheduleRows).toHaveLength(1);
    expect(result.scheduleRows[0]).toMatchObject({
      visitCode: 'NN2',
      scheduledDate: '2026-08-31', // Day+20
      windowStartDate: '2026-08-31',
      windowEndDate: '2026-09-08', // Day+28
    });
  });

  it('Scenario C: filled exactly Day 28 -> NN1 skipped, NN2 same-day single window', async () => {
    const result = (await runDecisionGraph(NN_DECISION_GRAPH, {
      deliveryDate: '2026-08-11',
      deliveryFormFilledDay: 28,
      localScheduleUuid1: 'nn1-uuid',
      localScheduleUuid2: 'nn2-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };

    expect(result.scheduleRows).toHaveLength(1);
    expect(result.scheduleRows[0]).toMatchObject({
      visitCode: 'NN2',
      scheduledDate: '2026-09-08',
      windowStartDate: '2026-09-08',
      windowEndDate: '2026-09-08',
    });
  });

  it('every generated row anchors on DELIVERY_DATE with visitType NN', async () => {
    const result = (await runDecisionGraph(NN_DECISION_GRAPH, {
      deliveryDate: '2026-08-11',
      deliveryFormFilledDay: 0,
      localScheduleUuid1: 'nn1-uuid',
      localScheduleUuid2: 'nn2-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };
    for (const row of result.scheduleRows) {
      expect(row.visitType).toBe('NN');
      expect(row.anchorType).toBe('DELIVERY_DATE');
    }
  });
});
