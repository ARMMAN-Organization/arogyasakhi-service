import { RuleVersionService } from './ruleVersion.service';
import type { RuleVersionRepository } from './ruleVersion.repository';
import { evaluateRulePack } from './ruleSet.evaluator';
import { evaluateSchedulePack } from './scheduleEvaluator';

jest.mock('./ruleSet.evaluator');
jest.mock('./scheduleEvaluator');

describe('RuleVersionService', () => {
  const repository = {
    findById: jest.fn(),
    findSetById: jest.fn(),
    findPublishedBySetId: jest.fn(),
    publishNewVersion: jest.fn(),
  } as unknown as jest.Mocked<RuleVersionRepository>;
  let service: RuleVersionService;
  const evaluateRulePackMock = jest.mocked(evaluateRulePack);
  const evaluateSchedulePackMock = jest.mocked(evaluateSchedulePack);

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RuleVersionService(repository);
  });

  const setId = '99999999-9999-9999-9999-999999999999';

  describe('getById', () => {
    it('returns id/ruleSetId/status only, dropping rulesJson/checksum/audit columns', async () => {
      repository.findById.mockResolvedValue({
        id: 'ver-1',
        ruleSetId: setId,
        versionNo: 'v1-hardcoded',
        rulesJson: { note: 'placeholder' },
        effectiveFrom: new Date('2026-08-01'),
        effectiveTo: null,
        publishedByUserId: null,
        status: 'PUBLISHED',
        checksum: Buffer.from('x'),
        createdByUserId: null,
        isDeleted: false,
      } as never);

      const result = await service.getById('ver-1');

      expect(result).toEqual({ id: 'ver-1', ruleSetId: setId, status: 'PUBLISHED' });
      expect(result).not.toHaveProperty('rulesJson');
      expect(result).not.toHaveProperty('checksum');
    });

    it('throws 404 when the rule version does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getPublished', () => {
    it('returns the published version (projected), dropping checksum/audit columns', async () => {
      repository.findSetById.mockResolvedValue({ id: setId } as never);
      repository.findPublishedBySetId.mockResolvedValue({
        id: 'ver-1',
        ruleSetId: setId,
        versionNo: 'v3',
        rulesJson: { rules: [] },
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        publishedByUserId: 'admin-1',
        status: 'PUBLISHED',
        checksum: Buffer.from('x'),
        createdByUserId: 'admin-1',
        isDeleted: false,
      } as never);

      const result = await service.getPublished(setId);

      expect(result).toEqual({
        id: 'ver-1',
        ruleSetId: setId,
        versionNo: 'v3',
        rulesJson: { rules: [] },
        effectiveFrom: new Date('2026-07-01'),
        effectiveTo: null,
        publishedByUserId: 'admin-1',
        status: 'PUBLISHED',
      });
      expect(result).not.toHaveProperty('checksum');
      expect(result).not.toHaveProperty('createdByUserId');
    });

    it('throws 404 when the rule set does not exist', async () => {
      repository.findSetById.mockResolvedValue(null);
      await expect(service.getPublished('missing')).rejects.toMatchObject({ status: 404 });
      expect(repository.findPublishedBySetId).not.toHaveBeenCalled();
    });

    it('throws 404 when the set exists but has no published version', async () => {
      repository.findSetById.mockResolvedValue({ id: setId } as never);
      repository.findPublishedBySetId.mockResolvedValue(null);
      await expect(service.getPublished(setId)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('publish', () => {
    it('creates a new PUBLISHED version, delegating versionNo derivation to the repository transaction', async () => {
      repository.findSetById.mockResolvedValue({ id: setId } as never);
      repository.publishNewVersion.mockImplementation(
        async (data) => ({ id: 'ver-3', ...data, versionNo: 'v3', status: 'PUBLISHED' }) as never,
      );

      const result = await service.publish(setId, { rulesJson: { rules: [1] } }, 'admin-1');

      const arg = repository.publishNewVersion.mock.calls[0][0];
      expect(arg.ruleSetId).toBe(setId);
      expect(arg).not.toHaveProperty('versionNo'); // computed inside the repo's transaction now
      expect(arg.publishedByUserId).toBe('admin-1');
      expect(Buffer.isBuffer(arg.checksum)).toBe(true); // computed SHA-256
      expect(result).toMatchObject({ status: 'PUBLISHED', ruleSetId: setId, versionNo: 'v3' });
      expect(result).not.toHaveProperty('checksum');
    });

    it('throws 404 when publishing to an unknown rule set', async () => {
      repository.findSetById.mockResolvedValue(null);
      await expect(service.publish('missing', { rulesJson: {} }, 'admin-1')).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.publishNewVersion).not.toHaveBeenCalled();
    });

    it('throws 409 when a concurrent publish for the same rule set collides (P2002)', async () => {
      repository.findSetById.mockResolvedValue({ id: setId } as never);
      repository.publishNewVersion.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.publish(setId, { rulesJson: { rules: [] } }, 'admin-1'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('throws 409 when the SERIALIZABLE transaction aborts on a concurrent publish (P2034)', async () => {
      repository.findSetById.mockResolvedValue({ id: setId } as never);
      repository.publishNewVersion.mockRejectedValue({ code: 'P2034' });

      await expect(
        service.publish(setId, { rulesJson: { rules: [] } }, 'admin-1'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('rethrows unrelated errors from publishNewVersion unchanged', async () => {
      repository.findSetById.mockResolvedValue({ id: setId } as never);
      const dbError = new Error('connection lost');
      repository.publishNewVersion.mockRejectedValue(dbError);

      await expect(service.publish(setId, { rulesJson: {} }, 'admin-1')).rejects.toBe(dbError);
    });
  });

  describe('evaluate', () => {
    it('evaluates against the published version and returns ruleVersionId alongside the results', async () => {
      repository.findSetById.mockResolvedValue({ id: setId, ruleCategory: 'RISK' } as never);
      repository.findPublishedBySetId.mockResolvedValue({
        id: 'ver-1',
        ruleSetId: setId,
        rulesJson: { rules: [] },
      } as never);
      evaluateRulePackMock.mockResolvedValue({
        overallRiskCategory: 'HIGH',
        conditions: [
          {
            riskConditionId: 'cond-1',
            grade: 'HIGH',
            gradeRank: 3,
            isReferralTrigger: true,
            isEducationTrigger: false,
            isHrVisitTrigger: true,
            observedValueJson: { systolicBp: 145 },
          },
        ],
      });

      const result = await service.evaluate(setId, { answers: { systolicBp: 145 } });

      expect(evaluateRulePackMock).toHaveBeenCalledWith({ rules: [] }, { systolicBp: 145 });
      expect(result).toEqual({
        ruleVersionId: 'ver-1',
        overallRiskCategory: 'HIGH',
        conditions: [
          {
            riskConditionId: 'cond-1',
            grade: 'HIGH',
            gradeRank: 3,
            isReferralTrigger: true,
            isEducationTrigger: false,
            isHrVisitTrigger: true,
            observedValueJson: { systolicBp: 145 },
          },
        ],
      });
    });

    it('404s when the rule set itself does not exist, never checking for a published version', async () => {
      repository.findSetById.mockResolvedValue(null);

      await expect(service.evaluate(setId, { answers: {} })).rejects.toMatchObject({
        status: 404,
        message: 'Rule set not found.',
      });
      expect(repository.findPublishedBySetId).not.toHaveBeenCalled();
      expect(evaluateRulePackMock).not.toHaveBeenCalled();
    });

    it('404s when the rule set exists but has no published version, never evaluating', async () => {
      repository.findSetById.mockResolvedValue({ id: setId, ruleCategory: 'RISK' } as never);
      repository.findPublishedBySetId.mockResolvedValue(null);

      await expect(service.evaluate(setId, { answers: {} })).rejects.toMatchObject({
        status: 404,
        message: 'No published rule pack version found for this rule set.',
      });
      expect(evaluateRulePackMock).not.toHaveBeenCalled();
    });

    it('propagates evaluateRulePack errors (e.g. malformed decision-graph output) unchanged', async () => {
      repository.findSetById.mockResolvedValue({ id: setId, ruleCategory: 'RISK' } as never);
      repository.findPublishedBySetId.mockResolvedValue({
        id: 'ver-1',
        ruleSetId: setId,
        rulesJson: {},
      } as never);
      const badRequestError = { status: 400, message: 'bad output' };
      evaluateRulePackMock.mockRejectedValue(badRequestError);

      await expect(service.evaluate(setId, { answers: {} })).rejects.toBe(badRequestError);
    });

    it('400s when the rule set is not RISK category, never evaluating', async () => {
      repository.findSetById.mockResolvedValue({ id: setId, ruleCategory: 'SCHEDULE' } as never);

      await expect(service.evaluate(setId, { answers: {} })).rejects.toMatchObject({
        status: 400,
      });
      expect(repository.findPublishedBySetId).not.toHaveBeenCalled();
      expect(evaluateRulePackMock).not.toHaveBeenCalled();
    });
  });

  describe('evaluateSchedule', () => {
    it('evaluates against the published version and returns ruleVersionId alongside the results', async () => {
      repository.findSetById.mockResolvedValue({ id: setId, ruleCategory: 'SCHEDULE' } as never);
      repository.findPublishedBySetId.mockResolvedValue({
        id: 'ver-1',
        ruleSetId: setId,
        rulesJson: { rules: [] },
      } as never);
      evaluateSchedulePackMock.mockResolvedValue({ visits: [] });

      const result = await service.evaluateSchedule(setId, {
        scheduleKind: 'ANC',
        input: { registrationDate: '2026-01-01' },
      });

      expect(evaluateSchedulePackMock).toHaveBeenCalledWith(
        'ANC',
        { rules: [] },
        { registrationDate: '2026-01-01' },
      );
      expect(result).toEqual({ ruleVersionId: 'ver-1', visits: [] });
    });

    it('404s when the rule set itself does not exist, never checking for a published version', async () => {
      repository.findSetById.mockResolvedValue(null);

      await expect(
        service.evaluateSchedule(setId, { scheduleKind: 'ANC', input: {} }),
      ).rejects.toMatchObject({ status: 404, message: 'Rule set not found.' });
      expect(repository.findPublishedBySetId).not.toHaveBeenCalled();
      expect(evaluateSchedulePackMock).not.toHaveBeenCalled();
    });

    it('400s when the rule set is not SCHEDULE category, never evaluating', async () => {
      repository.findSetById.mockResolvedValue({ id: setId, ruleCategory: 'RISK' } as never);

      await expect(
        service.evaluateSchedule(setId, { scheduleKind: 'ANC', input: {} }),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.findPublishedBySetId).not.toHaveBeenCalled();
      expect(evaluateSchedulePackMock).not.toHaveBeenCalled();
    });

    it('404s when the rule set exists but has no published version, never evaluating', async () => {
      repository.findSetById.mockResolvedValue({ id: setId, ruleCategory: 'SCHEDULE' } as never);
      repository.findPublishedBySetId.mockResolvedValue(null);

      await expect(
        service.evaluateSchedule(setId, { scheduleKind: 'ANC', input: {} }),
      ).rejects.toMatchObject({
        status: 404,
        message: 'No published rule pack version found for this rule set.',
      });
      expect(evaluateSchedulePackMock).not.toHaveBeenCalled();
    });
  });
});
