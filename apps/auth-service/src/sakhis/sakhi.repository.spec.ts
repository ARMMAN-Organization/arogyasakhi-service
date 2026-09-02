import { SakhiRepository } from './sakhi.repository';

describe('SakhiRepository', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const prisma = { sakhiProfile: { findMany, findFirst } } as never;
  let repository: SakhiRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new SakhiRepository(prisma);
  });

  describe('findByProject', () => {
    it('queries Sakhis for the given project, excluding soft-deleted, ordered by display name', async () => {
      findMany.mockResolvedValue([
        { id: 'sakhi-1', primaryProjectId: 'project-1', user: { displayName: 'Priya' } },
      ]);

      const result = await repository.findByProject('project-1');

      expect(findMany).toHaveBeenCalledWith({
        where: { primaryProjectId: 'project-1', isDeleted: false },
        include: { user: true },
        orderBy: { user: { displayName: 'asc' } },
      });
      expect(result).toEqual([
        { id: 'sakhi-1', primaryProjectId: 'project-1', user: { displayName: 'Priya' } },
      ]);
    });

    it('returns an empty array when the project has no Sakhis', async () => {
      findMany.mockResolvedValue([]);
      const result = await repository.findByProject('project-with-no-sakhis');
      expect(result).toEqual([]);
    });
  });

  describe('findById', () => {
    it('queries a single Sakhi by user id, excluding soft-deleted', async () => {
      findFirst.mockResolvedValue({ id: 'sakhi-1', user: { id: 'user-1', displayName: 'Priya' } });

      const result = await repository.findById('user-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { userId: 'user-1', isDeleted: false },
        include: { user: true },
      });
      expect(result).toEqual({ id: 'sakhi-1', user: { id: 'user-1', displayName: 'Priya' } });
    });

    it('returns null when the Sakhi does not exist', async () => {
      findFirst.mockResolvedValue(null);
      const result = await repository.findById('missing');
      expect(result).toBeNull();
    });
  });

  describe('findByIds', () => {
    it('queries Sakhis by user ids, excluding soft-deleted, unscoped when no projectId given', async () => {
      findMany.mockResolvedValue([{ id: 'sakhi-1', user: { id: 'user-1' } }]);

      const result = await repository.findByIds(['user-1', 'user-2'], {});

      expect(findMany).toHaveBeenCalledWith({
        where: { userId: { in: ['user-1', 'user-2'] }, isDeleted: false },
        include: { user: true },
      });
      expect(result).toEqual([{ id: 'sakhi-1', user: { id: 'user-1' } }]);
    });

    it('intersects with projectId when scoped', async () => {
      findMany.mockResolvedValue([]);

      await repository.findByIds(['user-1'], { projectId: 'project-1' });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          userId: { in: ['user-1'] },
          isDeleted: false,
          primaryProjectId: 'project-1',
        },
        include: { user: true },
      });
    });

    it('returns an empty array without querying when ids is empty', async () => {
      const result = await repository.findByIds([], {});
      expect(result).toEqual([]);
      expect(findMany).not.toHaveBeenCalled();
    });
  });
});
