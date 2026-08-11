import { runDecisionGraph } from '../ruleSet.evaluator';
import { COMBINED_SCHEDULE_DECISION_GRAPH } from './combinedSchedule.graph';

describe('COMBINED_SCHEDULE_DECISION_GRAPH', () => {
  it('routes visitFamily=ANC to the ANC sub-graph', async () => {
    const result = (await runDecisionGraph(COMBINED_SCHEDULE_DECISION_GRAPH, {
      visitFamily: 'ANC',
      mode: 'ANC1',
      registrationDate: '2026-08-11',
      edd: '2027-01-01',
      localScheduleUuid: 'anc1-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };
    expect(result.scheduleRows[0]).toMatchObject({
      visitCode: 'ANC1',
      scheduledDate: '2026-08-11',
    });
  });

  it('routes visitFamily=PP to the PP sub-graph', async () => {
    const result = (await runDecisionGraph(COMBINED_SCHEDULE_DECISION_GRAPH, {
      visitFamily: 'PP',
      visitCode: 'PP1',
      deliveryDate: '2026-08-11',
      localScheduleUuid: 'pp1-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };
    expect(result.scheduleRows[0]).toMatchObject({ visitCode: 'PP1', scheduledDate: '2026-08-11' });
  });

  it('routes visitFamily=NN to the NN sub-graph', async () => {
    const result = (await runDecisionGraph(COMBINED_SCHEDULE_DECISION_GRAPH, {
      visitFamily: 'NN',
      deliveryDate: '2026-08-11',
      deliveryFormFilledDay: 0,
      localScheduleUuid1: 'nn1-uuid',
      localScheduleUuid2: 'nn2-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };
    expect(result.scheduleRows).toHaveLength(2);
    expect(result.scheduleRows[0].visitCode).toBe('NN1');
  });

  it('routes visitFamily=INC to the INC sub-graph', async () => {
    const result = (await runDecisionGraph(COMBINED_SCHEDULE_DECISION_GRAPH, {
      visitFamily: 'INC',
      mode: 'PLAN',
      dob: '2026-01-01',
      registrationDate: '2026-01-10',
      registrationDaysFromDob: 9,
    })) as { branch: string; visitCount: number };
    expect(result).toMatchObject({ branch: 'early', visitCount: 10 });
  });

  it('routes visitFamily=CCV to the CCV sub-graph', async () => {
    const result = (await runDecisionGraph(COMBINED_SCHEDULE_DECISION_GRAPH, {
      visitFamily: 'CCV',
      mode: 'EXIT',
      dob: '2026-01-01',
      hrAtLastVisit: false,
    })) as { exitDate: string };
    expect(result.exitDate).toBe('2028-01-01');
  });
});
