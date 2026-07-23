import { GeographyService } from './geography.service';
import type { GeographyRepository } from './geography.repository';

describe('GeographyService', () => {
  const repository = {
    findById: jest.fn(),
    findAncestors: jest.fn(),
    findMany: jest.fn(),
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

  describe('getAncestors', () => {
    it('returns the chain (projected), ordered from the unit up to STATE', async () => {
      repository.findAncestors.mockResolvedValue([
        {
          geographyUnitId: 'pada-1',
          parentId: 'village-1',
          geoType: 'PADA',
          geoCode: 'PADA-001',
          name: 'Sample Pada',
          status: 'ACTIVE',
          createdByUserId: 'u',
        },
        {
          geographyUnitId: 'state-1',
          parentId: null,
          geoType: 'STATE',
          geoCode: 'MH',
          name: 'Maharashtra',
          status: 'ACTIVE',
          createdByUserId: 'u',
        },
      ] as never);

      const result = await service.getAncestors('pada-1');

      expect(result).toEqual([
        {
          geographyUnitId: 'pada-1',
          parentId: 'village-1',
          geoType: 'PADA',
          geoCode: 'PADA-001',
          name: 'Sample Pada',
          status: 'ACTIVE',
        },
        {
          geographyUnitId: 'state-1',
          parentId: null,
          geoType: 'STATE',
          geoCode: 'MH',
          name: 'Maharashtra',
          status: 'ACTIVE',
        },
      ]);
      expect(result[0]).not.toHaveProperty('createdByUserId');
    });

    it('throws 404 when the starting unit is not found', async () => {
      repository.findAncestors.mockResolvedValue([]);
      await expect(service.getAncestors('missing')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('list', () => {
    it('returns the projected units for the given filters', async () => {
      repository.findMany.mockResolvedValue([
        {
          geographyUnitId: 'state-1',
          parentId: null,
          geoType: 'STATE',
          geoCode: 'MH',
          name: 'Maharashtra',
          status: 'ACTIVE',
          createdByUserId: 'u',
          isDeleted: false,
        },
      ] as never);

      const result = await service.list({ geoType: 'STATE' });

      expect(repository.findMany).toHaveBeenCalledWith({ geoType: 'STATE' });
      expect(result).toEqual([
        {
          geographyUnitId: 'state-1',
          parentId: null,
          geoType: 'STATE',
          geoCode: 'MH',
          name: 'Maharashtra',
          status: 'ACTIVE',
        },
      ]);
      expect(result[0]).not.toHaveProperty('createdByUserId');
    });

    it('returns an empty array (not a 404) when no units match', async () => {
      repository.findMany.mockResolvedValue([]);
      await expect(service.list({ parentId: 'no-such-parent' })).resolves.toEqual([]);
    });
  });
});
