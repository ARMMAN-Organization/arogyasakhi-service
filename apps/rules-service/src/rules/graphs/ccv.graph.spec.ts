import { runDecisionGraph } from '../ruleSet.evaluator';
import { CCV_DECISION_GRAPH } from './ccv.graph';

describe('CCV_DECISION_GRAPH', () => {
  const riskStateInput = (overrides: Record<string, boolean>) => ({
    mode: 'RISK_STATE',
    mostRecentHasSamOrDangerSign: false,
    mostRecentHasOtherHr: false,
    hadAnyHrInLast12m: true,
    last3AllAtRisk: false,
    last3AllNormalFullyImmunised: false,
    ...overrides,
  });

  it('Currently HR - SAM/Danger Sign: HR visit every 30 days both age bands (cadence = 1 month)', async () => {
    const result = (await runDecisionGraph(
      CCV_DECISION_GRAPH,
      riskStateInput({ mostRecentHasSamOrDangerSign: true }),
    )) as { riskState: string; cadence18mMonths: number; cadence24mMonths: number };
    expect(result).toEqual({
      riskState: 'CURRENTLY_HR_SAM_DANGER',
      cadence18mMonths: 1,
      cadence24mMonths: 1,
    });
  });

  it('Currently HR - Other HR: same 30-day cadence both age bands', async () => {
    const result = (await runDecisionGraph(
      CCV_DECISION_GRAPH,
      riskStateInput({ mostRecentHasOtherHr: true }),
    )) as { riskState: string; cadence18mMonths: number; cadence24mMonths: number };
    expect(result).toEqual({
      riskState: 'CURRENTLY_HR_OTHER',
      cadence18mMonths: 1,
      cadence24mMonths: 1,
    });
  });

  it('Never at HR (no HR condition in the full 0-12m scan): every 2 months both bands', async () => {
    const result = (await runDecisionGraph(
      CCV_DECISION_GRAPH,
      riskStateInput({ hadAnyHrInLast12m: false }),
    )) as { riskState: string; cadence18mMonths: number; cadence24mMonths: number };
    expect(result).toEqual({ riskState: 'NEVER_AT_HR', cadence18mMonths: 2, cadence24mMonths: 2 });
  });

  it('Recently Recovered (last 3 INC visits were at risk): monthly 13-18m, every 2 months 19-24m', async () => {
    const result = (await runDecisionGraph(
      CCV_DECISION_GRAPH,
      riskStateInput({ last3AllAtRisk: true }),
    )) as { riskState: string; cadence18mMonths: number; cadence24mMonths: number };
    expect(result).toEqual({
      riskState: 'RECENTLY_RECOVERED',
      cadence18mMonths: 1,
      cadence24mMonths: 2,
    });
  });

  it('Stable Low Risk (last 3 normal, full immunisation): every 2 months both bands', async () => {
    const result = (await runDecisionGraph(
      CCV_DECISION_GRAPH,
      riskStateInput({ last3AllNormalFullyImmunised: true }),
    )) as { riskState: string; cadence18mMonths: number; cadence24mMonths: number };
    expect(result).toEqual({
      riskState: 'STABLE_LOW_RISK',
      cadence18mMonths: 2,
      cadence24mMonths: 2,
    });
  });

  it('CADENCE: next CCV visit is cadenceMonths after the previous, window +-5 days', async () => {
    const result = (await runDecisionGraph(CCV_DECISION_GRAPH, {
      mode: 'CADENCE',
      previousScheduledDate: '2027-01-01',
      cadenceMonths: 2,
      sequenceNo: 2,
      localScheduleUuid: 'ccv2-uuid',
      anchorVisitLocalUuid: 'ccv1-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };

    expect(result.scheduleRows[0]).toMatchObject({
      visitCode: 'CCV2',
      visitType: 'CCV',
      scheduledDate: '2027-03-01',
      windowStartDate: '2027-02-24',
      windowEndDate: '2027-03-06',
      anchorType: 'CCV_TRANSITION',
    });
  });

  it('CCV-HR: single instance per detection, 30 days after actual detection, window +-5', async () => {
    const result = (await runDecisionGraph(CCV_DECISION_GRAPH, {
      mode: 'HR',
      actualDetectionDate: '2027-03-01',
      sequenceNo: 3,
      localScheduleUuid: 'ccvhr-uuid',
      triggeringVisitLocalUuid: 'ccv2-uuid',
    })) as { scheduleRows: Array<Record<string, unknown>> };

    expect(result.scheduleRows[0]).toMatchObject({
      visitCode: 'CCV_HR',
      visitType: 'CCV_HR',
      scheduledDate: '2027-03-31',
      windowStartDate: '2027-03-26',
      windowEndDate: '2027-04-05',
    });
  });

  it('a second detection of the same condition still generates a fresh CCV-HR (no dedup)', async () => {
    const first = (await runDecisionGraph(CCV_DECISION_GRAPH, {
      mode: 'HR',
      actualDetectionDate: '2027-03-01',
      sequenceNo: 3,
      localScheduleUuid: 'ccvhr-1',
    })) as { scheduleRows: Array<Record<string, unknown>> };
    const second = (await runDecisionGraph(CCV_DECISION_GRAPH, {
      mode: 'HR',
      actualDetectionDate: '2027-05-01',
      sequenceNo: 5,
      localScheduleUuid: 'ccvhr-2',
    })) as { scheduleRows: Array<Record<string, unknown>> };

    expect(first.scheduleRows[0].scheduledDate).toBe('2027-03-31');
    expect(second.scheduleRows[0].scheduledDate).toBe('2027-05-31');
  });

  it('EXIT: program exit at DOB+730 (24 months) when no HR at the last visit', async () => {
    const result = (await runDecisionGraph(CCV_DECISION_GRAPH, {
      mode: 'EXIT',
      dob: '2026-01-01',
      hrAtLastVisit: false,
    })) as { exitDate: string; extendedByHr: boolean };
    expect(result).toEqual({ exitDate: '2028-01-01', extendedByHr: false });
  });

  it('EXIT: journey extends 30 days when HR is detected at the last CCV visit (~25 months)', async () => {
    const result = (await runDecisionGraph(CCV_DECISION_GRAPH, {
      mode: 'EXIT',
      dob: '2026-01-01',
      hrAtLastVisit: true,
    })) as { exitDate: string; extendedByHr: boolean };
    expect(result).toEqual({ exitDate: '2028-01-31', extendedByHr: true });
  });
});
