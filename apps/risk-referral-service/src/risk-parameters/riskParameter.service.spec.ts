import { RiskParameterService } from './riskParameter.service';
import type { RiskParameterRepository } from './riskParameter.repository';

function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rp-1',
    parameterCode: 'SYSTOLIC_BP',
    parameterName: 'Systolic Blood Pressure',
    entityType: 'MOTHER',
    unit: 'mmHg',
    dataType: 'NUMERIC',
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('RiskParameterService', () => {
  const repository = {
    findByParameterCodes: jest.fn(),
    findAllActive: jest.fn(),
  } as unknown as jest.Mocked<RiskParameterRepository>;
  let service: RiskParameterService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RiskParameterService(repository);
  });

  describe('listByParameterCodes — codes given', () => {
    it('returns the full row for each resolved parameter code', async () => {
      const rows = [
        buildRow({ id: 'rp-1', parameterCode: 'SYSTOLIC_BP' }),
        buildRow({ id: 'rp-2', parameterCode: 'HEMOGLOBIN', unit: 'g/dL' }),
      ];
      repository.findByParameterCodes.mockResolvedValue(rows as never);

      const result = await service.listByParameterCodes(['SYSTOLIC_BP', 'HEMOGLOBIN']);

      expect(result).toEqual(rows);
      expect(repository.findByParameterCodes).toHaveBeenCalledWith(['SYSTOLIC_BP', 'HEMOGLOBIN']);
      expect(repository.findAllActive).not.toHaveBeenCalled();
    });

    it('omits codes the repository did not resolve, without throwing', async () => {
      const rows = [buildRow({ id: 'rp-1', parameterCode: 'SYSTOLIC_BP' })];
      repository.findByParameterCodes.mockResolvedValue(rows as never);

      const result = await service.listByParameterCodes(['SYSTOLIC_BP', 'UNSEEDED_CODE']);

      expect(result).toEqual(rows);
    });

    it('returns an empty array when no codes resolve', async () => {
      repository.findByParameterCodes.mockResolvedValue([]);

      const result = await service.listByParameterCodes(['UNKNOWN']);

      expect(result).toEqual([]);
    });
  });

  describe('listByParameterCodes — no codes given', () => {
    it('returns every active parameter via findAllActive, without filtering by code', async () => {
      const rows = [
        buildRow({ id: 'rp-1', parameterCode: 'SYSTOLIC_BP' }),
        buildRow({ id: 'rp-2', parameterCode: 'HEMOGLOBIN', unit: 'g/dL' }),
      ];
      repository.findAllActive.mockResolvedValue(rows as never);

      const result = await service.listByParameterCodes();

      expect(result).toEqual(rows);
      expect(repository.findAllActive).toHaveBeenCalledWith();
      expect(repository.findByParameterCodes).not.toHaveBeenCalled();
    });

    it('returns an empty array when no parameters are seeded yet', async () => {
      repository.findAllActive.mockResolvedValue([]);

      const result = await service.listByParameterCodes();

      expect(result).toEqual([]);
    });
  });
});
