import { ArogyaSakhiRosterRepository } from './arogya-sakhi-roster.repository';

describe('ArogyaSakhiRosterRepository', () => {
  const findMany = jest.fn();
  const prisma = { sakhiProfile: { findMany } } as never;
  let repository: ArogyaSakhiRosterRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ArogyaSakhiRosterRepository(prisma);
  });

  describe('findByProject', () => {
    it('queries Sakhi profiles for the given project, excluding soft-deleted, ordered by display name', async () => {
      findMany.mockResolvedValue([
        { id: 'profile-1', primaryProjectId: 'project-1', user: { displayName: 'Priya' } },
      ]);

      const result = await repository.findByProject('project-1');

      expect(findMany).toHaveBeenCalledWith({
        where: { primaryProjectId: 'project-1', isDeleted: false },
        include: { user: true },
        orderBy: { user: { displayName: 'asc' } },
      });
      expect(result).toEqual([
        { id: 'profile-1', primaryProjectId: 'project-1', user: { displayName: 'Priya' } },
      ]);
    });

    it('returns an empty array when the project has no Sakhis', async () => {
      findMany.mockResolvedValue([]);
      const result = await repository.findByProject('project-with-no-sakhis');
      expect(result).toEqual([]);
    });
  });
});
