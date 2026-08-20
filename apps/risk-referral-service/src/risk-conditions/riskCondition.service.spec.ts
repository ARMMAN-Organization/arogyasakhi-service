import { RiskConditionService } from './riskCondition.service';
import type { RiskConditionRepository } from './riskCondition.repository';

function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rc-1',
    conditionCode: 'HYPERTENSION_HIGH_BP',
    conditionName: 'Hypertension / High BP',
    entityType: 'MOTHER',
    phase: 'ANC',
    gradeScale: 'NORMAL_LOW_MEDIUM_HIGH',
    referralRequiredDefault: true,
    educationRequiredDefault: false,
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('RiskConditionService', () => {
  const repository = {
    findByConditionCodes: jest.fn(),
    findAllActive: jest.fn(),
    findByIds: jest.fn(),
  } as unknown as jest.Mocked<RiskConditionRepository>;
  let service: RiskConditionService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RiskConditionService(repository);
  });

  describe('listByConditionCodes — codes given', () => {
    it('returns the full row for each resolved condition code', async () => {
      const rows = [
        buildRow({ id: 'rc-1', conditionCode: 'HYPERTENSION_HIGH_BP' }),
        buildRow({ id: 'rc-2', conditionCode: 'SICKLE_CELL_TRAIT' }),
      ];
      repository.findByConditionCodes.mockResolvedValue(rows as never);

      const result = await service.listByConditionCodes([
        'HYPERTENSION_HIGH_BP',
        'SICKLE_CELL_TRAIT',
      ]);

      expect(result).toEqual(rows);
      expect(repository.findByConditionCodes).toHaveBeenCalledWith([
        'HYPERTENSION_HIGH_BP',
        'SICKLE_CELL_TRAIT',
      ]);
      expect(repository.findAllActive).not.toHaveBeenCalled();
    });

    it('omits codes the repository did not resolve, without throwing', async () => {
      const rows = [buildRow({ id: 'rc-1', conditionCode: 'HYPERTENSION_HIGH_BP' })];
      repository.findByConditionCodes.mockResolvedValue(rows as never);

      const result = await service.listByConditionCodes(['HYPERTENSION_HIGH_BP', 'UNSEEDED_CODE']);

      expect(result).toEqual(rows);
    });

    it('returns an empty array when no codes resolve', async () => {
      repository.findByConditionCodes.mockResolvedValue([]);

      const result = await service.listByConditionCodes(['UNKNOWN']);

      expect(result).toEqual([]);
    });
  });

  describe('listByConditionCodes — no codes given', () => {
    it('returns every active condition via findAllActive, without filtering by code', async () => {
      const rows = [
        buildRow({ id: 'rc-1', conditionCode: 'HYPERTENSION_HIGH_BP' }),
        buildRow({ id: 'rc-2', conditionCode: 'SICKLE_CELL_TRAIT' }),
      ];
      repository.findAllActive.mockResolvedValue(rows as never);

      const result = await service.listByConditionCodes();

      expect(result).toEqual(rows);
      expect(repository.findAllActive).toHaveBeenCalledWith();
      expect(repository.findByConditionCodes).not.toHaveBeenCalled();
    });
  });

  describe('listByIds', () => {
    it('returns the full row for each resolved id', async () => {
      const rows = [buildRow({ id: 'rc-1' }), buildRow({ id: 'rc-2' })];
      repository.findByIds.mockResolvedValue(rows as never);

      const result = await service.listByIds(['rc-1', 'rc-2']);

      expect(result).toEqual(rows);
      expect(repository.findByIds).toHaveBeenCalledWith(['rc-1', 'rc-2']);
    });

    it('omits ids the repository did not resolve, without throwing', async () => {
      const rows = [buildRow({ id: 'rc-1' })];
      repository.findByIds.mockResolvedValue(rows as never);

      const result = await service.listByIds(['rc-1', 'rc-unseeded']);

      expect(result).toEqual(rows);
    });

    it('short-circuits to an empty array without querying when given no ids', async () => {
      const result = await service.listByIds([]);

      expect(result).toEqual([]);
      expect(repository.findByIds).not.toHaveBeenCalled();
    });
  });
});
