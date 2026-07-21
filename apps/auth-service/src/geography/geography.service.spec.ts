import { GeographyService } from './geography.service';
import type { GeographyRepository } from './geography.repository';

describe('GeographyService', () => {
  const repository = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<GeographyRepository>;

  let service: GeographyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new GeographyService(repository);
  });

  describe('getById', () => {
    it('returns the unit (projected), dropping internal audit columns', async () => {
      repository.findById.mockResolvedValue({
        geographyUnitId: 'phc-1',
        parentId: 'block-1',
        geoType: 'PHC',
        geoCode: 'PHC-001',
        name: 'Sample PHC',
        status: 'ACTIVE',
        createdByUserId: 'u',
        updatedByUserId: 'u',
        isDeleted: false,
      } as never);

      const result = await service.getById('phc-1');

      expect(result).toEqual({
        geographyUnitId: 'phc-1',
        parentId: 'block-1',
        geoType: 'PHC',
        geoCode: 'PHC-001',
        name: 'Sample PHC',
        status: 'ACTIVE',
      });
      expect(result).not.toHaveProperty('createdByUserId');
    });

    it('throws 404 when the unit is not found', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getById('missing')).rejects.toMatchObject({ status: 404 });
    });
  });
});
