import { runDecisionGraph } from '../ruleSet.evaluator';
import { ESCALATION_DECISION_GRAPH } from './escalation.graph';

describe('ESCALATION_DECISION_GRAPH', () => {
  const evalEscalation = (input: Record<string, unknown>) =>
    runDecisionGraph(ESCALATION_DECISION_GRAPH, input) as Promise<{
      shouldEscalate: boolean;
      reasonCode: string;
    }>;

  it('FR-S-3.5: 2 consecutive missed ANC visits escalates', async () => {
    const result = await evalEscalation({
      visitFamily: 'ANC',
      isHrVisit: false,
      consecutiveMissedCount: 2,
    });
    expect(result).toEqual({ shouldEscalate: true, reasonCode: 'TWO_CONSECUTIVE_MISSED' });
  });

  it('1 missed ANC (non-HR) visit does not yet escalate', async () => {
    const result = await evalEscalation({
      visitFamily: 'ANC',
      isHrVisit: false,
      consecutiveMissedCount: 1,
    });
    expect(result).toEqual({ shouldEscalate: false, reasonCode: 'BELOW_THRESHOLD' });
  });

  it('FR-S-3.6: 1 missed ANC-HR visit escalates immediately', async () => {
    const result = await evalEscalation({
      visitFamily: 'ANC',
      isHrVisit: true,
      consecutiveMissedCount: 1,
    });
    expect(result).toEqual({ shouldEscalate: true, reasonCode: 'HR_VISIT_MISSED' });
  });

  it.each(['PP', 'NN', 'CCV'])('%s: 1 missed visit escalates immediately', async (visitFamily) => {
    const result = await evalEscalation({
      visitFamily,
      isHrVisit: false,
      consecutiveMissedCount: 1,
    });
    expect(result).toEqual({ shouldEscalate: true, reasonCode: 'ONE_VISIT_MISSED' });
  });

  it('PP/NN/CCV: 0 missed visits does not escalate', async () => {
    const result = await evalEscalation({
      visitFamily: 'PP',
      isHrVisit: false,
      consecutiveMissedCount: 0,
    });
    expect(result).toEqual({ shouldEscalate: false, reasonCode: 'BELOW_THRESHOLD' });
  });

  it('INC: 2 consecutive missed (non-HR) visits escalates, same rule as ANC', async () => {
    const result = await evalEscalation({
      visitFamily: 'INC',
      isHrVisit: false,
      consecutiveMissedCount: 2,
    });
    expect(result).toEqual({ shouldEscalate: true, reasonCode: 'TWO_CONSECUTIVE_MISSED' });
  });

  it('INC: 1 missed (non-HR) visit does not yet escalate', async () => {
    const result = await evalEscalation({
      visitFamily: 'INC',
      isHrVisit: false,
      consecutiveMissedCount: 1,
    });
    expect(result).toEqual({ shouldEscalate: false, reasonCode: 'BELOW_THRESHOLD' });
  });

  it('INC: 1 missed INC-HR visit escalates immediately', async () => {
    const result = await evalEscalation({
      visitFamily: 'INC',
      isHrVisit: true,
      consecutiveMissedCount: 1,
    });
    expect(result).toEqual({ shouldEscalate: true, reasonCode: 'HR_VISIT_MISSED' });
  });
});
