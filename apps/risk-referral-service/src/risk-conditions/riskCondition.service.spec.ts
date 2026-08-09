import { RiskConditionService } from './riskCondition.service';
import type { RiskConditionRepository } from './riskCondition.repository';

describe('RiskConditionService', () => {
  const repository = {
    findByConditionCodes: jest.fn(),
  } as unknown as jest.Mocked<RiskConditionRepository>;
  let service: RiskConditionService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RiskConditionService(repository);
  });

  describe('listByConditionCodes', () => {
    it('returns riskConditionId for each resolved condition code', async () => {
      repository.findByConditionCodes.mockResolvedValue([
        { id: 'rc-1', conditionCode: 'HYPERTENSION_HIGH_BP' },
        { id: 'rc-2', conditionCode: 'SICKLE_CELL_TRAIT' },
      ] as never);

      const result = await service.listByConditionCodes([
        'HYPERTENSION_HIGH_BP',
        'SICKLE_CELL_TRAIT',
      ]);

      expect(result).toEqual([
        { conditionCode: 'HYPERTENSION_HIGH_BP', riskConditionId: 'rc-1' },
        { conditionCode: 'SICKLE_CELL_TRAIT', riskConditionId: 'rc-2' },
      ]);
    });

    it('omits codes the repository did not resolve, without throwing', async () => {
      repository.findByConditionCodes.mockResolvedValue([
        { id: 'rc-1', conditionCode: 'HYPERTENSION_HIGH_BP' },
      ] as never);

      const result = await service.listByConditionCodes(['HYPERTENSION_HIGH_BP', 'UNSEEDED_CODE']);

      expect(result).toEqual([{ conditionCode: 'HYPERTENSION_HIGH_BP', riskConditionId: 'rc-1' }]);
    });

    it('returns an empty array when no codes resolve', async () => {
      repository.findByConditionCodes.mockResolvedValue([]);

      const result = await service.listByConditionCodes(['UNKNOWN']);

      expect(result).toEqual([]);
    });
  });
});
