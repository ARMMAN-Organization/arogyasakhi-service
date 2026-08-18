import { ProjectGeographyRepository } from './project-geography.repository';

describe('ProjectGeographyRepository', () => {
  const findMany = jest.fn();
  const prisma = { projectGeography: { findMany } } as never;
  let repository: ProjectGeographyRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ProjectGeographyRepository(prisma);
  });

  describe('findActiveByProjectId', () => {
    it('queries rows for the project, excluding soft-deleted and outside the active window', async () => {
      findMany.mockResolvedValue([]);
      const asOf = new Date('2026-06-01');

      await repository.findActiveByProjectId('project-1', asOf);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          projectId: 'project-1',
          isDeleted: false,
          activeFrom: { lte: asOf },
          OR: [{ activeTo: null }, { activeTo: { gte: asOf } }],
        },
        orderBy: { createdAt: 'asc' },
      });
    });

    it('returns an empty array when the project has no mappings', async () => {
      findMany.mockResolvedValue([]);
      const result = await repository.findActiveByProjectId('project-with-no-mappings', new Date());
      expect(result).toEqual([]);
    });
  });
});
