import { GeographyRepository } from './geography.repository';

describe('GeographyRepository', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const create = jest.fn();
  const update = jest.fn();
  const prisma = { geographyUnit: { findMany, findFirst, create, update } } as never;
  let repository: GeographyRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new GeographyRepository(prisma);
  });

  describe('findChildren', () => {
    it('queries direct children of parentId, excluding soft-deleted, ordered by geoCode', async () => {
      findMany.mockResolvedValue([
        { geographyUnitId: 'district-1', parentId: 'state-1', geoType: 'DISTRICT' },
      ]);

      const result = await repository.findChildren('state-1');

      expect(findMany).toHaveBeenCalledWith({
        where: { parentId: 'state-1', isDeleted: false },
        orderBy: { geoCode: 'asc' },
      });
      expect(result).toEqual([
        { geographyUnitId: 'district-1', parentId: 'state-1', geoType: 'DISTRICT' },
      ]);
    });

    it('returns an empty array when the parent has no children', async () => {
      findMany.mockResolvedValue([]);
      const result = await repository.findChildren('pada-1');
      expect(result).toEqual([]);
    });
  });

  describe('findByIds', () => {
    it('queries by geographyUnitId IN ids, excluding soft-deleted, in one call', async () => {
      findMany.mockResolvedValue([
        { geographyUnitId: 'phc-1', parentId: 'block-1', geoType: 'PHC' },
        { geographyUnitId: 'pada-1', parentId: 'village-1', geoType: 'PADA' },
      ]);

      const result = await repository.findByIds(['phc-1', 'pada-1']);

      expect(findMany).toHaveBeenCalledTimes(1);
      expect(findMany).toHaveBeenCalledWith({
        where: { geographyUnitId: { in: ['phc-1', 'pada-1'] }, isDeleted: false },
      });
      expect(result).toEqual([
        { geographyUnitId: 'phc-1', parentId: 'block-1', geoType: 'PHC' },
        { geographyUnitId: 'pada-1', parentId: 'village-1', geoType: 'PADA' },
      ]);
    });

    it('returns an empty array without querying when ids is empty', async () => {
      const result = await repository.findByIds([]);
      expect(result).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });
  });

  describe('findRoots', () => {
    it('queries units with parentId null, excluding soft-deleted, ordered by geoCode', async () => {
      findMany.mockResolvedValue([
        { geographyUnitId: 'state-1', parentId: null, geoType: 'STATE' },
      ]);

      const result = await repository.findRoots();

      expect(findMany).toHaveBeenCalledWith({
        where: { parentId: null, isDeleted: false },
        orderBy: { geoCode: 'asc' },
      });
      expect(result).toEqual([{ geographyUnitId: 'state-1', parentId: null, geoType: 'STATE' }]);
    });

    it('returns an empty array when no roots are seeded', async () => {
      findMany.mockResolvedValue([]);
      const result = await repository.findRoots();
      expect(result).toEqual([]);
    });
  });

  describe('findMany', () => {
    it('defaults to top-level units (parentId null) when no filters are given', async () => {
      findMany.mockResolvedValue([
        { geographyUnitId: 'state-1', parentId: null, geoType: 'STATE' },
      ]);

      const result = await repository.findMany({});

      expect(findMany).toHaveBeenCalledWith({
        where: { isDeleted: false, parentId: null },
        orderBy: { geoCode: 'asc' },
        take: 500,
      });
      expect(result).toEqual([{ geographyUnitId: 'state-1', parentId: null, geoType: 'STATE' }]);
    });

    it('filters by geoType and parentId when both are given', async () => {
      findMany.mockResolvedValue([]);

      await repository.findMany({ geoType: 'DISTRICT', parentId: 'state-1' });

      expect(findMany).toHaveBeenCalledWith({
        where: { isDeleted: false, geoType: 'DISTRICT', parentId: 'state-1' },
        orderBy: { geoCode: 'asc' },
        take: 500,
      });
    });

    it('filters by geoType alone (no parentId defaulting when a filter is present)', async () => {
      findMany.mockResolvedValue([]);

      await repository.findMany({ geoType: 'STATE' });

      expect(findMany).toHaveBeenCalledWith({
        where: { isDeleted: false, geoType: 'STATE' },
        orderBy: { geoCode: 'asc' },
        take: 500,
      });
    });

    it('filters by parentId alone', async () => {
      findMany.mockResolvedValue([]);

      await repository.findMany({ parentId: 'state-1' });

      expect(findMany).toHaveBeenCalledWith({
        where: { isDeleted: false, parentId: 'state-1' },
        orderBy: { geoCode: 'asc' },
        take: 500,
      });
    });
  });

  describe('findUpdatedSince', () => {
    it('queries with no where filter (including soft-deleted rows) when since is undefined', async () => {
      findMany.mockResolvedValue([]);

      await repository.findUpdatedSince(undefined);

      expect(findMany).toHaveBeenCalledWith({
        where: undefined,
        orderBy: { updatedAt: 'asc' },
      });
    });

    it('filters by updatedAt greater than since when provided', async () => {
      findMany.mockResolvedValue([]);
      const since = new Date('2026-01-01T00:00:00.000Z');

      await repository.findUpdatedSince(since);

      expect(findMany).toHaveBeenCalledWith({
        where: { updatedAt: { gt: since } },
        orderBy: { updatedAt: 'asc' },
      });
    });
  });

  describe('createUnit', () => {
    it('creates a unit with the given fields, defaulting parentId/geoCode to null, and stamps audit columns', async () => {
      create.mockResolvedValue({ geographyUnitId: 'district-1' });

      await repository.createUnit({ geoType: 'STATE', name: 'Maharashtra' } as never, 'admin-1');

      expect(create).toHaveBeenCalledWith({
        data: {
          parentId: null,
          geoType: 'STATE',
          geoCode: null,
          name: 'Maharashtra',
          createdByUserId: 'admin-1',
          updatedByUserId: 'admin-1',
        },
      });
    });
  });

  describe('updateUnit', () => {
    it('returns null when the unit does not exist or is soft-deleted', async () => {
      findFirst.mockResolvedValue(null);

      const result = await repository.updateUnit('missing', { name: 'New Name' }, 'admin-1');

      expect(result).toBeNull();
      expect(update).not.toHaveBeenCalled();
    });

    it('updates the unit and stamps updatedByUserId when it exists', async () => {
      findFirst.mockResolvedValue({ geographyUnitId: 'district-1' });
      update.mockResolvedValue({ geographyUnitId: 'district-1', name: 'New Name' });

      const result = await repository.updateUnit('district-1', { name: 'New Name' }, 'admin-1');

      expect(update).toHaveBeenCalledWith({
        where: { geographyUnitId: 'district-1' },
        data: { name: 'New Name', updatedByUserId: 'admin-1' },
      });
      expect(result).toEqual({ geographyUnitId: 'district-1', name: 'New Name' });
    });
  });

  describe('hasActiveChildren', () => {
    it('returns true when a non-deleted child exists', async () => {
      findFirst.mockResolvedValue({ geographyUnitId: 'district-1' });

      const result = await repository.hasActiveChildren('state-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { parentId: 'state-1', isDeleted: false },
        select: { geographyUnitId: true },
      });
      expect(result).toBe(true);
    });

    it('returns false when no non-deleted child exists', async () => {
      findFirst.mockResolvedValue(null);
      const result = await repository.hasActiveChildren('pada-1');
      expect(result).toBe(false);
    });
  });

  describe('softDelete', () => {
    it('returns null when the unit does not exist or is soft-deleted', async () => {
      findFirst.mockResolvedValue(null);

      const result = await repository.softDelete('missing', 'admin-1');

      expect(result).toBeNull();
      expect(update).not.toHaveBeenCalled();
    });

    it('sets isDeleted/deletedAt/updatedByUserId when the unit exists', async () => {
      findFirst.mockResolvedValue({ geographyUnitId: 'pada-1' });
      update.mockResolvedValue({ geographyUnitId: 'pada-1', isDeleted: true });

      const result = await repository.softDelete('pada-1', 'admin-1');

      expect(update).toHaveBeenCalledWith({
        where: { geographyUnitId: 'pada-1' },
        data: expect.objectContaining({ isDeleted: true, updatedByUserId: 'admin-1' }),
      });
      expect(result).toEqual({ geographyUnitId: 'pada-1', isDeleted: true });
    });
  });
});
