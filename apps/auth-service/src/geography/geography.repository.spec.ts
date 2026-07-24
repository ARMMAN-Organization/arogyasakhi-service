import { GeographyRepository } from './geography.repository';

describe('GeographyRepository', () => {
  const findMany = jest.fn();
  const prisma = { geographyUnit: { findMany } } as never;
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
});
