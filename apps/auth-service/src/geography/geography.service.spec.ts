import { GeographyService } from './geography.service';
import type { GeographyRepository } from './geography.repository';

describe('GeographyService', () => {
  const repository = {
    findById: jest.fn(),
    findAncestors: jest.fn(),
    findChildren: jest.fn(),
    findRoots: jest.fn(),
    findMany: jest.fn(),
    createUnit: jest.fn(),
    updateUnit: jest.fn(),
    hasActiveChildren: jest.fn(),
    softDelete: jest.fn(),
    stateGeoCodeExists: jest.fn(),
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

  describe('create', () => {
    it('creates a STATE with no parentId', async () => {
      repository.stateGeoCodeExists.mockResolvedValue(false);
      repository.createUnit.mockResolvedValue({
        geographyUnitId: 'state-1',
        parentId: null,
        geoType: 'STATE',
        geoCode: 'MH',
        name: 'Maharashtra',
        status: 'ACTIVE',
      } as never);

      const result = await service.create(
        { geoType: 'STATE', name: 'Maharashtra', geoCode: 'MH' } as never,
        'admin-1',
      );

      expect(repository.createUnit).toHaveBeenCalledWith(
        { geoType: 'STATE', name: 'Maharashtra', geoCode: 'MH' },
        'admin-1',
      );
      expect(result).toEqual({
        geographyUnitId: 'state-1',
        parentId: null,
        geoType: 'STATE',
        geoCode: 'MH',
        name: 'Maharashtra',
        status: 'ACTIVE',
      });
    });

    it('rejects a STATE that has a parentId', async () => {
      await expect(
        service.create(
          { geoType: 'STATE', parentId: 'x', name: 'Maharashtra' } as never,
          'admin-1',
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.createUnit).not.toHaveBeenCalled();
    });

    it('rejects a STATE whose geoCode already exists on another STATE (DB unique constraint cannot catch this since every STATE has parentId=null)', async () => {
      repository.stateGeoCodeExists.mockResolvedValue(true);

      await expect(
        service.create({ geoType: 'STATE', name: 'Karnataka', geoCode: 'KA' } as never, 'admin-1'),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.createUnit).not.toHaveBeenCalled();
    });

    it('allows creating a STATE with no geoCode without checking for duplicates', async () => {
      repository.createUnit.mockResolvedValue({
        geographyUnitId: 'state-1',
        parentId: null,
        geoType: 'STATE',
        name: 'Maharashtra',
        status: 'ACTIVE',
      } as never);

      await service.create({ geoType: 'STATE', name: 'Maharashtra' } as never, 'admin-1');

      expect(repository.stateGeoCodeExists).not.toHaveBeenCalled();
    });

    it('rejects a non-STATE unit with no parentId', async () => {
      await expect(
        service.create({ geoType: 'DISTRICT', name: 'Nandurbar' } as never, 'admin-1'),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.createUnit).not.toHaveBeenCalled();
    });

    it('rejects a parentId that does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.create(
          { geoType: 'DISTRICT', parentId: 'missing', name: 'Nandurbar' } as never,
          'admin-1',
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('rejects creating a child under an inactive parent', async () => {
      repository.findById.mockResolvedValue({ geoType: 'STATE', status: 'INACTIVE' } as never);

      await expect(
        service.create(
          { geoType: 'DISTRICT', parentId: 'state-1', name: 'Nandurbar' } as never,
          'admin-1',
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.createUnit).not.toHaveBeenCalled();
    });

    it('rejects a geoType that is not exactly one level below the parent', async () => {
      repository.findById.mockResolvedValue({ geoType: 'STATE', status: 'ACTIVE' } as never);

      await expect(
        service.create(
          { geoType: 'BLOCK', parentId: 'state-1', name: 'Dhadgaon' } as never,
          'admin-1',
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.createUnit).not.toHaveBeenCalled();
    });

    it('creates a unit one level below a valid parent', async () => {
      repository.findById.mockResolvedValue({ geoType: 'STATE', status: 'ACTIVE' } as never);
      repository.createUnit.mockResolvedValue({
        geographyUnitId: 'district-1',
        parentId: 'state-1',
        geoType: 'DISTRICT',
        geoCode: 'NANDURBAR',
        name: 'Nandurbar',
        status: 'ACTIVE',
      } as never);

      const result = await service.create(
        {
          geoType: 'DISTRICT',
          parentId: 'state-1',
          name: 'Nandurbar',
          geoCode: 'NANDURBAR',
        } as never,
        'admin-1',
      );

      expect(result).toMatchObject({ geographyUnitId: 'district-1', geoType: 'DISTRICT' });
    });

    it('maps a unique-constraint violation to 409', async () => {
      repository.findById.mockResolvedValue({ geoType: 'STATE', status: 'ACTIVE' } as never);
      repository.createUnit.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.create(
          { geoType: 'DISTRICT', parentId: 'state-1', name: 'Nandurbar' } as never,
          'admin-1',
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('update', () => {
    it('returns the updated unit (projected)', async () => {
      repository.updateUnit.mockResolvedValue({
        geographyUnitId: 'district-1',
        parentId: 'state-1',
        geoType: 'DISTRICT',
        geoCode: 'NANDURBAR',
        name: 'Nandurbar Renamed',
        status: 'ACTIVE',
      } as never);

      const result = await service.update('district-1', { name: 'Nandurbar Renamed' }, 'admin-1');

      expect(repository.updateUnit).toHaveBeenCalledWith(
        'district-1',
        { name: 'Nandurbar Renamed' },
        'admin-1',
      );
      expect(result).toMatchObject({ name: 'Nandurbar Renamed' });
    });

    it('throws 404 when the unit does not exist', async () => {
      repository.updateUnit.mockResolvedValue(null);
      await expect(service.update('missing', { name: 'X' }, 'admin-1')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('maps a unique-constraint violation to 409', async () => {
      repository.findById.mockResolvedValue({ geoType: 'DISTRICT' } as never);
      repository.updateUnit.mockRejectedValue({ code: 'P2002' });
      await expect(
        service.update('district-1', { geoCode: 'DUP' }, 'admin-1'),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('rejects renaming a STATE to a geoCode already used by another STATE (DB unique constraint cannot catch this since every STATE has parentId=null)', async () => {
      repository.findById.mockResolvedValue({ geoType: 'STATE' } as never);
      repository.stateGeoCodeExists.mockResolvedValue(true);

      await expect(service.update('state-1', { geoCode: 'KA' }, 'admin-1')).rejects.toMatchObject({
        status: 409,
      });
      expect(repository.updateUnit).not.toHaveBeenCalled();
    });

    it('excludes the unit itself when checking for a STATE geoCode collision', async () => {
      repository.findById.mockResolvedValue({ geoType: 'STATE' } as never);
      repository.stateGeoCodeExists.mockResolvedValue(false);
      repository.updateUnit.mockResolvedValue({ geographyUnitId: 'state-1' } as never);

      await service.update('state-1', { geoCode: 'KA' }, 'admin-1');

      expect(repository.stateGeoCodeExists).toHaveBeenCalledWith('KA', 'state-1');
    });

    it('does not check for STATE duplicates when geoCode is not part of the update', async () => {
      repository.updateUnit.mockResolvedValue({ geographyUnitId: 'district-1' } as never);

      await service.update('district-1', { name: 'Renamed' }, 'admin-1');

      expect(repository.stateGeoCodeExists).not.toHaveBeenCalled();
      expect(repository.findById).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('soft-deletes a unit with no active children', async () => {
      repository.findById.mockResolvedValue({ geographyUnitId: 'pada-1' } as never);
      repository.hasActiveChildren.mockResolvedValue(false);

      await service.remove('pada-1', 'admin-1');

      expect(repository.softDelete).toHaveBeenCalledWith('pada-1', 'admin-1');
    });

    it('throws 404 when the unit does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.remove('missing', 'admin-1')).rejects.toMatchObject({ status: 404 });
      expect(repository.softDelete).not.toHaveBeenCalled();
    });

    it('throws 409 when the unit has active children', async () => {
      repository.findById.mockResolvedValue({ geographyUnitId: 'state-1' } as never);
      repository.hasActiveChildren.mockResolvedValue(true);

      await expect(service.remove('state-1', 'admin-1')).rejects.toMatchObject({ status: 409 });
      expect(repository.softDelete).not.toHaveBeenCalled();
    });
  });
});
