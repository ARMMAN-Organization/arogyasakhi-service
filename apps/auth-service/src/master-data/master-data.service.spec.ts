import { MasterDataService } from './master-data.service';
import type { GeographyRepository } from '../geography/geography.repository';
import type { ProjectRepository } from '../projects/project.repository';

describe('MasterDataService', () => {
  const geographyRepository = {
    findUpdatedSince: jest.fn(),
  } as unknown as jest.Mocked<GeographyRepository>;

  const projectRepository = {
    findProjectsUpdatedSince: jest.fn(),
    findFundersUpdatedSince: jest.fn(),
  } as unknown as jest.Mocked<ProjectRepository>;

  let service: MasterDataService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MasterDataService(geographyRepository, projectRepository);
    geographyRepository.findUpdatedSince.mockResolvedValue([]);
    projectRepository.findProjectsUpdatedSince.mockResolvedValue([]);
    projectRepository.findFundersUpdatedSince.mockResolvedValue([]);
  });

  it('passes undefined to every repository when since is omitted (full snapshot)', async () => {
    await service.getDeltas(undefined);

    expect(geographyRepository.findUpdatedSince).toHaveBeenCalledWith(undefined);
    expect(projectRepository.findProjectsUpdatedSince).toHaveBeenCalledWith(undefined);
    expect(projectRepository.findFundersUpdatedSince).toHaveBeenCalledWith(undefined);
  });

  it('converts a since string to a Date and passes it to every repository', async () => {
    await service.getDeltas('2026-01-01T00:00:00.000Z');

    expect(geographyRepository.findUpdatedSince).toHaveBeenCalledWith(
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(projectRepository.findProjectsUpdatedSince).toHaveBeenCalledWith(
      new Date('2026-01-01T00:00:00.000Z'),
    );
    expect(projectRepository.findFundersUpdatedSince).toHaveBeenCalledWith(
      new Date('2026-01-01T00:00:00.000Z'),
    );
  });

  it('returns serverTime as a fresh Date on every call', async () => {
    const before = Date.now();
    const result = await service.getDeltas(undefined);
    const after = Date.now();

    expect(result.serverTime.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.serverTime.getTime()).toBeLessThanOrEqual(after);
  });

  it('projects geography units including isDeleted/deletedAt (unlike the read-API projection)', async () => {
    geographyRepository.findUpdatedSince.mockResolvedValue([
      {
        geographyUnitId: 'g1',
        parentId: null,
        geoType: 'STATE',
        geoCode: 'MH',
        name: 'Maharashtra',
        status: 'ACTIVE',
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        isDeleted: false,
        deletedAt: null,
        createdByUserId: 'admin-1',
      },
    ] as never);

    const result = await service.getDeltas(undefined);

    expect(result.geographyUnits).toEqual([
      {
        geographyUnitId: 'g1',
        parentId: null,
        geoType: 'STATE',
        geoCode: 'MH',
        name: 'Maharashtra',
        status: 'ACTIVE',
        updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        isDeleted: false,
        deletedAt: null,
      },
    ]);
  });

  it('includes soft-deleted geography units with isDeleted true and a populated deletedAt', async () => {
    geographyRepository.findUpdatedSince.mockResolvedValue([
      {
        geographyUnitId: 'g2',
        parentId: null,
        geoType: 'STATE',
        geoCode: 'KA',
        name: 'Karnataka',
        status: 'ACTIVE',
        updatedAt: new Date('2026-01-03T00:00:00.000Z'),
        isDeleted: true,
        deletedAt: new Date('2026-01-03T00:00:00.000Z'),
      },
    ] as never);

    const result = await service.getDeltas(undefined);

    expect(result.geographyUnits[0]).toMatchObject({
      isDeleted: true,
      deletedAt: new Date('2026-01-03T00:00:00.000Z'),
    });
  });

  it('projects projects (with nested funder) including isDeleted/deletedAt', async () => {
    projectRepository.findProjectsUpdatedSince.mockResolvedValue([
      {
        projectId: 'p1',
        funderId: 'f1',
        funder: {
          funderId: 'f1',
          funderCode: 'ARMMAN-CSR',
          funderName: 'ARMMAN CSR',
          status: 'ACTIVE',
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          isDeleted: false,
          deletedAt: null,
        },
        projectCode: 'GEP-2627',
        projectName: 'GEP 2026-27',
        financialYear: '2026-27',
        startDate: new Date('2026-04-01'),
        endDate: null,
        status: 'ACTIVE',
        updatedAt: new Date('2026-01-04T00:00:00.000Z'),
        isDeleted: false,
        deletedAt: null,
      },
    ] as never);

    const result = await service.getDeltas(undefined);

    expect(result.projects).toEqual([
      {
        projectId: 'p1',
        funderId: 'f1',
        funder: {
          funderId: 'f1',
          funderCode: 'ARMMAN-CSR',
          funderName: 'ARMMAN CSR',
          status: 'ACTIVE',
          updatedAt: new Date('2026-01-01T00:00:00.000Z'),
          isDeleted: false,
          deletedAt: null,
        },
        projectCode: 'GEP-2627',
        projectName: 'GEP 2026-27',
        financialYear: '2026-27',
        startDate: new Date('2026-04-01'),
        endDate: null,
        status: 'ACTIVE',
        updatedAt: new Date('2026-01-04T00:00:00.000Z'),
        isDeleted: false,
        deletedAt: null,
      },
    ]);
  });

  it('projects a project with a null funder as null (not throwing)', async () => {
    projectRepository.findProjectsUpdatedSince.mockResolvedValue([
      {
        projectId: 'p2',
        funderId: null,
        funder: null,
        projectCode: 'GEP-STANDALONE',
        projectName: 'Standalone',
        financialYear: '2026-27',
        startDate: new Date('2026-04-01'),
        endDate: null,
        status: 'ACTIVE',
        updatedAt: new Date('2026-01-05T00:00:00.000Z'),
        isDeleted: false,
        deletedAt: null,
      },
    ] as never);

    const result = await service.getDeltas(undefined);

    expect(result.projects[0].funder).toBeNull();
  });

  it('projects funders including isDeleted/deletedAt', async () => {
    projectRepository.findFundersUpdatedSince.mockResolvedValue([
      {
        funderId: 'f2',
        funderCode: 'OTHER-FUNDER',
        funderName: 'Other Funder',
        status: 'ACTIVE',
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        isDeleted: false,
        deletedAt: null,
      },
    ] as never);

    const result = await service.getDeltas(undefined);

    expect(result.funders).toEqual([
      {
        funderId: 'f2',
        funderCode: 'OTHER-FUNDER',
        funderName: 'Other Funder',
        status: 'ACTIVE',
        updatedAt: new Date('2026-01-06T00:00:00.000Z'),
        isDeleted: false,
        deletedAt: null,
      },
    ]);
  });

  it('returns independently empty arrays when only one entity has changes', async () => {
    geographyRepository.findUpdatedSince.mockResolvedValue([
      { geographyUnitId: 'g1', isDeleted: false, deletedAt: null } as never,
    ]);

    const result = await service.getDeltas(undefined);

    expect(result.geographyUnits).toHaveLength(1);
    expect(result.projects).toEqual([]);
    expect(result.funders).toEqual([]);
  });
});
