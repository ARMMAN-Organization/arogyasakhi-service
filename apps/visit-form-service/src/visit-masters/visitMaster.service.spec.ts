import { VisitMasterService } from './visitMaster.service';
import type { VisitMasterRepository } from './visitMaster.repository';

function buildRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'vm-1',
    visitCode: 'ANC1',
    visitType: 'ANC',
    displayName: 'ANC Visit 1',
    entityType: 'MOTHER',
    sequenceOrder: 1,
    description: 'Registration date (Day 0). Window: Day 0 to Day +5.',
    isActive: true,
    ...overrides,
  };
}

describe('VisitMasterService', () => {
  const repository = {
    findByVisitCodes: jest.fn(),
    findAllActive: jest.fn(),
  } as unknown as jest.Mocked<VisitMasterRepository>;
  let service: VisitMasterService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new VisitMasterService(repository);
  });

  describe('listByVisitCodes — codes given', () => {
    it('returns the full row for each resolved visit code', async () => {
      const rows = [
        buildRow({ id: 'vm-1', visitCode: 'ANC1' }),
        buildRow({ id: 'vm-2', visitCode: 'PP3', displayName: 'Postpartum Visit 3' }),
      ];
      repository.findByVisitCodes.mockResolvedValue(rows as never);

      const result = await service.listByVisitCodes(['ANC1', 'PP3']);

      expect(result).toEqual(rows);
      expect(repository.findByVisitCodes).toHaveBeenCalledWith(['ANC1', 'PP3']);
      expect(repository.findAllActive).not.toHaveBeenCalled();
    });

    it('omits codes the repository did not resolve, without throwing', async () => {
      const rows = [buildRow({ id: 'vm-1', visitCode: 'ANC1' })];
      repository.findByVisitCodes.mockResolvedValue(rows as never);

      const result = await service.listByVisitCodes(['ANC1', 'UNSEEDED_CODE']);

      expect(result).toEqual(rows);
    });

    it('returns an empty array when no codes resolve', async () => {
      repository.findByVisitCodes.mockResolvedValue([]);

      const result = await service.listByVisitCodes(['UNKNOWN']);

      expect(result).toEqual([]);
    });
  });

  describe('listByVisitCodes — no codes given', () => {
    it('returns every active visit master via findAllActive, without filtering by code', async () => {
      const rows = [
        buildRow({ id: 'vm-1', visitCode: 'ANC1' }),
        buildRow({ id: 'vm-2', visitCode: 'PP3' }),
      ];
      repository.findAllActive.mockResolvedValue(rows as never);

      const result = await service.listByVisitCodes();

      expect(result).toEqual(rows);
      expect(repository.findAllActive).toHaveBeenCalledWith();
      expect(repository.findByVisitCodes).not.toHaveBeenCalled();
    });
  });
});
