import { runDecisionGraph } from '../ruleSet.evaluator';
import { ANC_DECISION_GRAPH } from './anc.graph';

describe('ANC_DECISION_GRAPH', () => {
  it('FR-S-3.1: visit count = Round((EDD - RegistrationDate)/30) + 1', async () => {
    const result = (await runDecisionGraph(ANC_DECISION_GRAPH, {
      mode: 'VISIT_COUNT',
      registrationDate: '2026-08-11',
      edd: '2027-01-01',
    })) as { visitCount: number };
    expect(result.visitCount).toBe(6); // 143 days remaining -> round(143/30)+1
  });

  it('registration on LMP date yields the maximum 10-visit count', async () => {
    const result = (await runDecisionGraph(ANC_DECISION_GRAPH, {
      mode: 'VISIT_COUNT',
      registrationDate: '2026-01-01',
      edd: '2026-10-08', // 280 days later (LMP + 280)
    })) as { visitCount: number };
    expect(result.visitCount).toBe(10);
  });

  it('FR-S-3.2: ANC1 window is [registrationDate, registrationDate+5]', async () => {
    const result = (await runDecisionGraph(ANC_DECISION_GRAPH, {
      mode: 'ANC1',
      registrationDate: '2026-08-11',
      edd: '2027-01-01',
      localScheduleUuid: 'anc1-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };
    expect(result.scheduleRows).toEqual([
      {
        localScheduleUuid: 'anc1-uuid',
        visitCode: 'ANC1',
        visitType: 'ANC',
        sequenceNo: 1,
        scheduledDate: '2026-08-11',
        windowStartDate: '2026-08-11',
        windowEndDate: '2026-08-16',
        anchorType: 'REGISTRATION',
        anchorVisitLocalUuid: null,
      },
    ]);
  });

  it('FR-S-3.3: ANC2..N chain every 30 days from the previous, window +-5', async () => {
    const result = (await runDecisionGraph(ANC_DECISION_GRAPH, {
      mode: 'CHAINED',
      previousScheduledDate: '2026-08-11',
      sequenceNo: 2,
      localScheduleUuid: 'anc2-uuid',
      previousVisitLocalUuid: 'anc1-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };
    expect(result.scheduleRows[0]).toMatchObject({
      visitCode: 'ANC2',
      scheduledDate: '2026-09-10',
      windowStartDate: '2026-09-05',
      windowEndDate: '2026-09-15',
      anchorVisitLocalUuid: 'anc1-uuid',
    });
  });

  it('FR-S-3.4: ANC-HR anchors on the ACTUAL completion date + 15, window +-2', async () => {
    const result = (await runDecisionGraph(ANC_DECISION_GRAPH, {
      mode: 'HR',
      actualCompletionDate: '2026-09-01',
      sequenceNo: 3,
      localScheduleUuid: 'anchr-uuid',
      triggeringVisitLocalUuid: 'anc2-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };
    expect(result.scheduleRows[0]).toMatchObject({
      visitCode: 'ANC_HR',
      visitType: 'ANC_HR',
      scheduledDate: '2026-09-16',
      windowStartDate: '2026-09-14',
      windowEndDate: '2026-09-18',
      anchorType: 'ACTUAL_VISIT',
    });
  });

  it('SR-ANC-01: generates the post-EDD visit at EDD+8 once the grace period has passed', async () => {
    const result = (await runDecisionGraph(ANC_DECISION_GRAPH, {
      mode: 'POST_EDD',
      edd: '2027-01-01',
      deliveryFormFiled: false,
      daysSinceEdd: 8,
      totalRegularAncVisits: 8,
      localScheduleUuid: 'ancpe-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };
    expect(result.scheduleRows[0]).toMatchObject({
      visitCode: 'ANC9',
      visitType: 'ANC_POST_EDD',
      sequenceNo: 9,
      scheduledDate: '2027-01-09',
      windowStartDate: '2027-01-09',
      windowEndDate: '2027-01-14',
      anchorType: 'EDD',
    });
  });

  it('SR-ANC-01: names the visit ANC11 when 10 regular ANC visits were generated', async () => {
    const result = (await runDecisionGraph(ANC_DECISION_GRAPH, {
      mode: 'POST_EDD',
      edd: '2027-01-01',
      deliveryFormFiled: false,
      daysSinceEdd: 8,
      totalRegularAncVisits: 10,
      localScheduleUuid: 'ancpe-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };
    expect(result.scheduleRows[0].visitCode).toBe('ANC11');
  });

  it('SR-ANC-01: does not generate the post-EDD visit before the grace period elapses', async () => {
    const result = (await runDecisionGraph(ANC_DECISION_GRAPH, {
      mode: 'POST_EDD',
      edd: '2027-01-01',
      deliveryFormFiled: false,
      daysSinceEdd: 3,
      totalRegularAncVisits: 8,
      localScheduleUuid: 'ancpe-uuid',
    })) as { scheduleRows: unknown[] };
    expect(result.scheduleRows).toEqual([]);
  });
});
