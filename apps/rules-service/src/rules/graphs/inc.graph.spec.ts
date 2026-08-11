import { runDecisionGraph } from '../ruleSet.evaluator';
import { INC_DECISION_GRAPH } from './inc.graph';

describe('INC_DECISION_GRAPH', () => {
  it('early registration (Day 0-58 inclusive): INC1 anchors DOB+58, count = Round((365-58)/30) = 10', async () => {
    const result = (await runDecisionGraph(INC_DECISION_GRAPH, {
      mode: 'PLAN',
      dob: '2026-01-01',
      registrationDate: '2026-01-10',
      registrationDaysFromDob: 9,
    })) as { branch: string; visitCount: number; inc1Date: string };

    expect(result.branch).toBe('early');
    expect(result.visitCount).toBe(10);
    expect(result.inc1Date).toBe('2026-02-28'); // DOB + 58 days
  });

  it('registration exactly on Day 58 is still classified early (SRS: Day 0 to Day 58 inclusive)', async () => {
    const result = (await runDecisionGraph(INC_DECISION_GRAPH, {
      mode: 'PLAN',
      dob: '2026-01-01',
      registrationDate: '2026-02-28',
      registrationDaysFromDob: 58,
    })) as { branch: string };
    expect(result.branch).toBe('early');
  });

  it('late registration (Day 59+): INC1 = registration date itself, count = Round((365-regDays)/30)', async () => {
    const result = (await runDecisionGraph(INC_DECISION_GRAPH, {
      mode: 'PLAN',
      dob: '2026-01-01',
      registrationDate: '2026-04-11',
      registrationDaysFromDob: 100,
    })) as { branch: string; visitCount: number; inc1Date: string };

    expect(result.branch).toBe('late');
    expect(result.visitCount).toBe(9); // Round((365-100)/30) = Round(8.83) = 9
    expect(result.inc1Date).toBe('2026-04-11');
  });

  it('registration on Day 59 is classified late', async () => {
    const result = (await runDecisionGraph(INC_DECISION_GRAPH, {
      mode: 'PLAN',
      dob: '2026-01-01',
      registrationDate: '2026-03-01',
      registrationDaysFromDob: 59,
    })) as { branch: string };
    expect(result.branch).toBe('late');
  });

  it('CHAINED: next INC visit is 30 days after the previous, window +-5', async () => {
    const result = (await runDecisionGraph(INC_DECISION_GRAPH, {
      mode: 'CHAINED',
      dob: '2026-01-01',
      previousScheduledDate: '2026-03-01',
      sequenceNo: 2,
      localScheduleUuid: 'inc2-uuid',
      previousVisitLocalUuid: 'inc1-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };

    expect(result.scheduleRows[0]).toMatchObject({
      visitCode: 'INC2',
      scheduledDate: '2026-03-31',
      windowStartDate: '2026-03-26',
      windowEndDate: '2026-04-05',
      anchorType: 'DOB',
      anchorVisitLocalUuid: 'inc1-uuid',
    });
  });

  it('hard cutoff: a computed date beyond DOB+370 is dropped, not generated, not marked missed', async () => {
    const result = (await runDecisionGraph(INC_DECISION_GRAPH, {
      mode: 'CHAINED',
      dob: '2026-01-01',
      previousScheduledDate: '2027-01-01', // DOB+365; +30 = DOB+395, past the DOB+370 cutoff
      sequenceNo: 12,
      localScheduleUuid: 'inc12-uuid',
    })) as { scheduleRows: unknown[]; droppedByCutoff: boolean };

    expect(result.scheduleRows).toEqual([]);
    expect(result.droppedByCutoff).toBe(true);
  });

  it('a computed date exactly at DOB+370 is NOT dropped (cutoff is inclusive of the boundary)', async () => {
    const result = (await runDecisionGraph(INC_DECISION_GRAPH, {
      mode: 'CHAINED',
      dob: '2026-01-01',
      previousScheduledDate: '2026-12-07', // DOB+340; +30 = DOB+370 exactly
      sequenceNo: 13,
      localScheduleUuid: 'inc13-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };

    expect(result.scheduleRows).toHaveLength(1);
    expect(result.scheduleRows[0]).toMatchObject({
      visitCode: 'INC13',
      scheduledDate: '2027-01-06',
    });
  });

  it('a computed date one day past DOB+370 (DOB+371) is dropped', async () => {
    const result = (await runDecisionGraph(INC_DECISION_GRAPH, {
      mode: 'CHAINED',
      dob: '2026-01-01',
      previousScheduledDate: '2026-12-08', // DOB+341; +30 = DOB+371
      sequenceNo: 14,
      localScheduleUuid: 'inc14-uuid',
    })) as { scheduleRows: unknown[] };

    expect(result.scheduleRows).toEqual([]);
  });

  it('INC-HR anchors on the ACTUAL completion date + 15, window +-2', async () => {
    const result = (await runDecisionGraph(INC_DECISION_GRAPH, {
      mode: 'HR',
      dob: '2026-01-01',
      actualCompletionDate: '2026-03-01',
      sequenceNo: 3,
      localScheduleUuid: 'inchr-uuid',
      triggeringVisitLocalUuid: 'inc2-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };

    expect(result.scheduleRows[0]).toMatchObject({
      visitCode: 'INC_HR',
      visitType: 'INC_HR',
      scheduledDate: '2026-03-16',
      windowStartDate: '2026-03-14',
      windowEndDate: '2026-03-18',
      anchorType: 'ACTUAL_VISIT',
    });
  });
});
