import { GeographyService } from './geography.service';
import type { GeographyRepository } from './geography.repository';

describe('GeographyService', () => {
  const repository = {
    findById: jest.fn(),
    findAncestors: jest.fn(),
    findChildren: jest.fn(),
    findRoots: jest.fn(),
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

  describe('getChildren', () => {
    it('returns the projected children of a parent that has some', async () => {
      repository.findById.mockResolvedValue({
        geographyUnitId: 'state-1',
        parentId: null,
        geoType: 'STATE',
        geoCode: 'MH',
        name: 'Maharashtra',
        status: 'ACTIVE',
      } as never);
      repository.findChildren.mockResolvedValue([
        {
          geographyUnitId: 'district-1',
          parentId: 'state-1',
          geoType: 'DISTRICT',
          geoCode: 'NANDURBAR',
          name: 'Nandurbar',
          status: 'ACTIVE',
          createdByUserId: 'u',
        },
      ] as never);

      const result = await service.getChildren('state-1');

      expect(result).toEqual([
        {
          geographyUnitId: 'district-1',
          parentId: 'state-1',
          geoType: 'DISTRICT',
          geoCode: 'NANDURBAR',
          name: 'Nandurbar',
          status: 'ACTIVE',
        },
      ]);
      expect(result[0]).not.toHaveProperty('createdByUserId');
    });

    it('returns an empty array when the parent exists but has no children', async () => {
      repository.findById.mockResolvedValue({
        geographyUnitId: 'pada-1',
        parentId: 'village-1',
        geoType: 'PADA',
        geoCode: 'PADA-001',
        name: 'Sample Pada',
        status: 'ACTIVE',
      } as never);
      repository.findChildren.mockResolvedValue([]);

      const result = await service.getChildren('pada-1');

      expect(result).toEqual([]);
    });

    it('throws 404 when the parent itself does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getChildren('missing')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('getRoots', () => {
    it('returns the projected top-level units', async () => {
      repository.findRoots.mockResolvedValue([
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

      const result = await service.getRoots();

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

    it('returns an empty array when no roots are seeded (not an error)', async () => {
      repository.findRoots.mockResolvedValue([]);
      const result = await service.getRoots();
      expect(result).toEqual([]);
    });
  });
});
