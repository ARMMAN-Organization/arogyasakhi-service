import { ProjectService } from './project.service';
import type { ProjectRepository } from './project.repository';

describe('ProjectService', () => {
  const repository = {
    findManyActiveProjects: jest.fn(),
    findProjectById: jest.fn(),
    createProject: jest.fn(),
    updateProject: jest.fn(),
    findManyFunders: jest.fn(),
    createFunder: jest.fn(),
  } as unknown as jest.Mocked<ProjectRepository>;

  let service: ProjectService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ProjectService(repository);
  });

  describe('list', () => {
    it('returns active projects projected to the documented fields (no internal columns)', async () => {
      const projects = [
        { projectId: 'p1', projectName: 'P1', createdByUserId: 'u', isDeleted: false },
      ];
      repository.findManyActiveProjects.mockResolvedValue(projects as never);

      const result = await service.list();
      expect(result[0]).toEqual(expect.objectContaining({ projectId: 'p1', projectName: 'P1' }));
      expect(result[0]).not.toHaveProperty('createdByUserId');
      expect(result[0]).not.toHaveProperty('isDeleted');
    });
  });

  describe('getById', () => {
    it('returns a project projected to the documented fields', async () => {
      const project = { projectId: 'p1', createdByUserId: 'u', deletedAt: null };
      repository.findProjectById.mockResolvedValue(project as never);

      const result = await service.getById('p1');
      expect(result).toEqual(expect.objectContaining({ projectId: 'p1' }));
      expect(result).not.toHaveProperty('createdByUserId');
      expect(result).not.toHaveProperty('deletedAt');
    });

    it('throws 404 when the project is not found', async () => {
      repository.findProjectById.mockResolvedValue(null);

      await expect(service.getById('missing')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('create', () => {
    const input = {
      funderId: 'funder-1',
      projectCode: 'GEP-2324',
      projectName: 'GEP 2023-24',
      financialYear: '2023-24',
      startDate: new Date('2023-04-01'),
    };

    it('creates and returns a project with a valid funderId', async () => {
      const created = { projectId: 'p1', ...input };
      repository.createProject.mockResolvedValue(created as never);

      await expect(service.create(input)).resolves.toEqual(
        expect.objectContaining({ projectId: 'p1', projectCode: 'GEP-2324' }),
      );
      expect(repository.createProject).toHaveBeenCalledWith(input);
    });

    it('creates a project with funderId omitted (funder is optional)', async () => {
      const withoutFunder = {
        projectCode: input.projectCode,
        projectName: input.projectName,
        financialYear: input.financialYear,
        startDate: input.startDate,
      };
      const created = { projectId: 'p2', ...withoutFunder, funderId: null };
      repository.createProject.mockResolvedValue(created as never);

      await expect(service.create(withoutFunder)).resolves.toEqual(
        expect.objectContaining({ projectId: 'p2', funderId: null }),
      );
    });

    it('throws 409 on a duplicate project code', async () => {
      repository.createProject.mockRejectedValue({ code: 'P2002' });

      await expect(service.create(input)).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('update', () => {
    it('updates fields and returns the updated project', async () => {
      const updated = { projectId: 'p1', projectName: 'Renamed' };
      repository.updateProject.mockResolvedValue(updated as never);

      await expect(service.update('p1', { projectName: 'Renamed' })).resolves.toEqual(
        expect.objectContaining({ projectId: 'p1', projectName: 'Renamed' }),
      );
    });

    it('throws 404 when the project does not exist', async () => {
      repository.updateProject.mockResolvedValue(null);

      await expect(service.update('missing', { projectName: 'Renamed' })).rejects.toMatchObject({
        status: 404,
      });
    });
  });

  describe('listFunders', () => {
    it('returns funders projected to documented fields (no internal columns)', async () => {
      const funders = [{ funderId: 'f1', funderCode: 'BMGF', isDeleted: false }];
      repository.findManyFunders.mockResolvedValue(funders as never);

      const result = await service.listFunders();
      expect(result[0]).toEqual(expect.objectContaining({ funderId: 'f1', funderCode: 'BMGF' }));
      expect(result[0]).not.toHaveProperty('isDeleted');
    });
  });

  describe('createFunder', () => {
    it('creates and returns a funder', async () => {
      const input = { funderCode: 'BMGF', funderName: 'Gates Foundation' };
      const created = { funderId: 'f1', ...input };
      repository.createFunder.mockResolvedValue(created as never);

      await expect(service.createFunder(input)).resolves.toEqual(
        expect.objectContaining({ funderId: 'f1', funderCode: 'BMGF' }),
      );
    });

    it('throws 409 on a duplicate funder code', async () => {
      repository.createFunder.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.createFunder({ funderCode: 'BMGF', funderName: 'Gates Foundation' }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });
});
