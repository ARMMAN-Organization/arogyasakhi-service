import { ProjectGeographyService } from './project-geography.service';
import type { ProjectGeographyRepository } from './project-geography.repository';

describe('ProjectGeographyService', () => {
  const repository = {
    findActiveByProjectId: jest.fn(),
  } as unknown as jest.Mocked<ProjectGeographyRepository>;

  let service: ProjectGeographyService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProjectGeographyService(repository);
  });

  const rawRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'project-geo-1',
    projectId: 'project-1',
    geographyUnitId: 'geo-unit-1',
    activeFrom: new Date('2026-04-01'),
    activeTo: null,
    createdByUserId: 'admin-1',
    updatedByUserId: 'admin-1',
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  });

  describe('list', () => {
    it('returns the projected rows for a project with active mappings', async () => {
      repository.findActiveByProjectId.mockResolvedValue([rawRow()] as never);

      const result = await service.list('project-1');

      expect(result).toEqual([
        {
          id: 'project-geo-1',
          projectId: 'project-1',
          geographyUnitId: 'geo-unit-1',
          activeFrom: new Date('2026-04-01'),
          activeTo: null,
        },
      ]);
      expect(result[0]).not.toHaveProperty('isDeleted');
      expect(result[0]).not.toHaveProperty('createdByUserId');
    });

    it('returns an empty array (not an error) when the project has no active mappings', async () => {
      repository.findActiveByProjectId.mockResolvedValue([]);
      await expect(service.list('project-with-no-mappings')).resolves.toEqual([]);
    });

    it('returns an empty array (not a 404) for an unknown projectId', async () => {
      repository.findActiveByProjectId.mockResolvedValue([]);
      await expect(service.list('missing-project')).resolves.toEqual([]);
    });

    it('passes the projectId through to the repository with the current time as asOf', async () => {
      repository.findActiveByProjectId.mockResolvedValue([]);
      await service.list('project-1');
      expect(repository.findActiveByProjectId).toHaveBeenCalledWith('project-1', expect.any(Date));
    });

    it('includes a row with an open-ended activeTo', async () => {
      repository.findActiveByProjectId.mockResolvedValue([rawRow({ activeTo: null })] as never);
      const result = await service.list('project-1');
      expect(result[0].activeTo).toBeNull();
    });

    it('includes a row with a future activeTo (not yet ended)', async () => {
      const futureRow = rawRow({ activeTo: new Date('2099-01-01') });
      repository.findActiveByProjectId.mockResolvedValue([futureRow] as never);
      const result = await service.list('project-1');
      expect(result[0].activeTo).toEqual(new Date('2099-01-01'));
    });
  });
});
