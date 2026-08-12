import { evaluateEscalationPack } from '../escalationEvaluator';
import { escalationRulesJson } from './escalation.rulesJson';

describe('escalationRulesJson (via evaluateEscalationPack)', () => {
  describe('ANC', () => {
    it('escalates at the two-consecutive-miss threshold (FR-S-3.5/FR-S-7.1)', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'ANC',
        isHrVisit: false,
        consecutiveMissedCount: 2,
      });
      expect(result).toEqual({ shouldEscalate: true, reasonCode: 'ANC_TWO_CONSECUTIVE_MISSED' });
    });

    it('does not escalate below the threshold (count=1)', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'ANC',
        isHrVisit: false,
        consecutiveMissedCount: 1,
      });
      expect(result.shouldEscalate).toBe(false);
    });

    it('escalates above the threshold (count=3)', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'ANC',
        isHrVisit: false,
        consecutiveMissedCount: 3,
      });
      expect(result.shouldEscalate).toBe(true);
    });

    it('HR overrides the family threshold: escalates on the first miss (FR-S-3.6)', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'ANC',
        isHrVisit: true,
        consecutiveMissedCount: 1,
      });
      expect(result).toEqual({ shouldEscalate: true, reasonCode: 'HR_VISIT_MISSED' });
    });
  });

  describe('HR override across other families', () => {
    it('INC, HR visit missed: escalates on the first miss', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'INC',
        isHrVisit: true,
        consecutiveMissedCount: 1,
      });
      expect(result).toEqual({ shouldEscalate: true, reasonCode: 'HR_VISIT_MISSED' });
    });

    it('CCV, HR visit missed: escalates on the first miss', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'CCV',
        isHrVisit: true,
        consecutiveMissedCount: 1,
      });
      expect(result).toEqual({ shouldEscalate: true, reasonCode: 'HR_VISIT_MISSED' });
    });
  });

  describe('INC', () => {
    it('escalates at the two-consecutive-miss threshold (FR-S-7.1)', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'INC',
        isHrVisit: false,
        consecutiveMissedCount: 2,
      });
      expect(result).toEqual({ shouldEscalate: true, reasonCode: 'INC_TWO_CONSECUTIVE_MISSED' });
    });

    it('does not escalate below the threshold (count=1)', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'INC',
        isHrVisit: false,
        consecutiveMissedCount: 1,
      });
      expect(result.shouldEscalate).toBe(false);
    });
  });

  describe('single-miss families (ANC_POST_EDD/PP/NN/CCV)', () => {
    it('PP escalates on the first miss', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'PP',
        isHrVisit: false,
        consecutiveMissedCount: 1,
      });
      expect(result).toEqual({ shouldEscalate: true, reasonCode: 'SINGLE_VISIT_MISSED' });
    });

    it('NN escalates on the first miss', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'NN',
        isHrVisit: false,
        consecutiveMissedCount: 1,
      });
      expect(result).toEqual({ shouldEscalate: true, reasonCode: 'SINGLE_VISIT_MISSED' });
    });

    it('CCV escalates on the first miss', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'CCV',
        isHrVisit: false,
        consecutiveMissedCount: 1,
      });
      expect(result).toEqual({ shouldEscalate: true, reasonCode: 'SINGLE_VISIT_MISSED' });
    });

    it('ANC_POST_EDD escalates on the first miss', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'ANC_POST_EDD',
        isHrVisit: false,
        consecutiveMissedCount: 1,
      });
      expect(result).toEqual({ shouldEscalate: true, reasonCode: 'SINGLE_VISIT_MISSED' });
    });

    it('PP with zero misses does not escalate', async () => {
      const result = await evaluateEscalationPack(escalationRulesJson, {
        visitFamily: 'PP',
        isHrVisit: false,
        consecutiveMissedCount: 0,
      });
      expect(result.shouldEscalate).toBe(false);
    });
  });

  describe('validation errors', () => {
    it('rejects an unrecognized visitFamily', async () => {
      await expect(
        evaluateEscalationPack(escalationRulesJson, {
          visitFamily: 'BOGUS',
          isHrVisit: false,
          consecutiveMissedCount: 1,
        }),
      ).rejects.toBeTruthy();
    });
  });
});
