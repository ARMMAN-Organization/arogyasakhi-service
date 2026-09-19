import { badRequest } from '@armman/service-commons';
import { SakhiService } from './sakhi.service';
import type { SakhiRepository } from './sakhi.repository';
import type { GeographyService } from '../geography/geography.service';

describe('SakhiService', () => {
  const repository = {
    findByProject: jest.fn(),
    findById: jest.fn(),
    findManyByIds: jest.fn(),
    findActiveLocationAssignments: jest.fn(),
    findLocationAssignmentById: jest.fn(),
    createLocationAssignment: jest.fn(),
    updateLocationAssignment: jest.fn(),
    endLocationAssignment: jest.fn(),
  } as unknown as jest.Mocked<SakhiRepository>;
  const geographyService = {
    assertActiveUnitOfType: jest.fn(),
  } as unknown as jest.Mocked<GeographyService>;

  let service: SakhiService;

  const unscopedCaller = { id: 'admin-1', roles: ['ADMIN'], projectId: null };
  const scopedCaller = (projectId: string, id = 'supervisor-1') => ({
    id,
    roles: ['SUPERVISOR'],
    projectId,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SakhiService(repository, geographyService);
  });

  const rawProfile = () => ({
    id: 'sakhi-1',
    employeeCode: 'EMP-00123',
    primaryProjectId: 'project-1',
    supervisorId: 'supervisor-1',
    activeFrom: new Date('2026-04-01'),
    activeTo: null,
    panToken: Buffer.from('secret'),
    aadhaarToken: Buffer.from('secret'),
    bankAccountToken: Buffer.from('secret'),
    user: {
      id: 'user-1',
      displayName: 'Priya Sharma',
      mobileNumber: '+919000000123',
      status: 'ACTIVE',
      passwordHash: 'hashed',
    },
  });

  describe('listByProject', () => {
    it('returns the projected Sakhis for a project, never leaking PII tokens or passwordHash', async () => {
      repository.findByProject.mockResolvedValue([rawProfile()] as never);

      const result = await service.listByProject('project-1', unscopedCaller);

      expect(result).toEqual([
        {
          sakhiId: 'user-1',
          displayName: 'Priya Sharma',
          mobileNumber: '+919000000123',
          status: 'ACTIVE',
          employeeCode: 'EMP-00123',
          primaryProjectId: 'project-1',
          supervisorId: 'supervisor-1',
          activeFrom: new Date('2026-04-01'),
          activeTo: null,
        },
      ]);
      expect(result[0]).not.toHaveProperty('panToken');
      expect(result[0]).not.toHaveProperty('aadhaarToken');
      expect(result[0]).not.toHaveProperty('bankAccountToken');
      expect(result[0]).not.toHaveProperty('passwordHash');
    });

    it('returns an empty array (not an error) when the project has no Sakhis', async () => {
      repository.findByProject.mockResolvedValue([]);
      await expect(
        service.listByProject('project-with-no-sakhis', unscopedCaller),
      ).resolves.toEqual([]);
    });

    it('allows a caller with no project scope (MANAGER/ADMIN) to list any project', async () => {
      repository.findByProject.mockResolvedValue([]);
      await expect(service.listByProject('project-1', unscopedCaller)).resolves.toEqual([]);
      expect(repository.findByProject).toHaveBeenCalledWith('project-1');
    });

    it('returns every Sakhi in the project for a SYSTEM caller — a cron job service token has no supervisorId any real Sakhi would match', async () => {
      repository.findByProject.mockResolvedValue([rawProfile()] as never);
      const systemCaller = { id: 'sync-delay-sweep-svc', roles: ['SYSTEM'], projectId: null };

      const result = await service.listByProject('project-1', systemCaller);

      expect(result).toHaveLength(1);
      expect(result[0].supervisorId).toBe('supervisor-1');
    });

    it('allows a scoped caller (SUPERVISOR) to list their own project', async () => {
      repository.findByProject.mockResolvedValue([]);
      await expect(service.listByProject('project-1', scopedCaller('project-1'))).resolves.toEqual(
        [],
      );
    });

    it('rejects a scoped caller listing a different project', async () => {
      await expect(
        service.listByProject('project-1', scopedCaller('project-2')),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findByProject).not.toHaveBeenCalled();
    });

    it('scopes a SUPERVISOR caller to only their own assigned Sakhis', async () => {
      const ownProfile = { ...rawProfile(), supervisorId: 'supervisor-1' };
      const otherProfile = {
        ...rawProfile(),
        supervisorId: 'other-supervisor',
        user: { ...rawProfile().user, id: 'user-2', displayName: 'Other Sakhi' },
      };
      repository.findByProject.mockResolvedValue([ownProfile, otherProfile] as never);

      const result = await service.listByProject('project-1', scopedCaller('project-1'));

      expect(result).toEqual([expect.objectContaining({ supervisorId: 'supervisor-1' })]);
    });

    it('does not scope a MANAGER/ADMIN caller — sees every Sakhi in the project', async () => {
      const profileA = { ...rawProfile(), supervisorId: 'supervisor-1' };
      const profileB = {
        ...rawProfile(),
        supervisorId: 'other-supervisor',
        user: { ...rawProfile().user, id: 'user-2', displayName: 'Other Sakhi' },
      };
      repository.findByProject.mockResolvedValue([profileA, profileB] as never);

      const result = await service.listByProject('project-1', unscopedCaller);

      expect(result).toHaveLength(2);
    });

    it('does not scope down a caller who holds SUPERVISOR alongside an elevated role', async () => {
      const profileA = { ...rawProfile(), supervisorId: 'supervisor-1' };
      const profileB = {
        ...rawProfile(),
        supervisorId: 'other-supervisor',
        user: { ...rawProfile().user, id: 'user-2', displayName: 'Other Sakhi' },
      };
      repository.findByProject.mockResolvedValue([profileA, profileB] as never);

      const dualRoleCaller = {
        id: 'supervisor-1',
        roles: ['SUPERVISOR', 'ADMIN'],
        projectId: null,
      };
      const result = await service.listByProject('project-1', dualRoleCaller);

      expect(result).toHaveLength(2);
    });
  });

  describe('getById', () => {
    it('returns the projected Sakhi', async () => {
      repository.findById.mockResolvedValue(rawProfile() as never);

      const result = await service.getById('user-1', unscopedCaller);

      expect(result).toMatchObject({ sakhiId: 'user-1', displayName: 'Priya Sharma' });
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('throws 404 when the Sakhi does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getById('missing', unscopedCaller)).rejects.toMatchObject({
        status: 404,
      });
    });

    it('allows a scoped caller (SUPERVISOR) to fetch a Sakhi in their own project', async () => {
      repository.findById.mockResolvedValue(rawProfile() as never);
      await expect(service.getById('user-1', scopedCaller('project-1'))).resolves.toMatchObject({
        sakhiId: 'user-1',
      });
    });

    it('rejects a scoped caller fetching a Sakhi from a different project', async () => {
      repository.findById.mockResolvedValue(rawProfile() as never);
      await expect(service.getById('user-1', scopedCaller('project-2'))).rejects.toMatchObject({
        status: 403,
      });
    });

    it('allows a SAKHI caller to fetch their own record', async () => {
      repository.findById.mockResolvedValue(rawProfile() as never);
      const sakhiCaller = { id: 'user-1', roles: ['SAKHI'], projectId: null };
      await expect(service.getById('user-1', sakhiCaller)).resolves.toMatchObject({
        sakhiId: 'user-1',
      });
    });

    it(
      "allows a SAKHI caller to fetch their own record even when their JWT's projectId " +
        "doesn't match their profile's primaryProjectId — regression: the SUPERVISOR " +
        'project-scope check must not also apply to a SAKHI fetching their own record',
      async () => {
        repository.findById.mockResolvedValue(rawProfile() as never); // primaryProjectId: 'project-1'
        const sakhiCaller = { id: 'user-1', roles: ['SAKHI'], projectId: 'some-other-project' };
        await expect(service.getById('user-1', sakhiCaller)).resolves.toMatchObject({
          sakhiId: 'user-1',
        });
      },
    );

    it('rejects a SAKHI caller fetching a different Sakhi', async () => {
      const sakhiCaller = { id: 'user-1', roles: ['SAKHI'], projectId: null };
      await expect(service.getById('user-2', sakhiCaller)).rejects.toMatchObject({
        status: 403,
      });
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it(
      'allows a caller holding both MANAGER and SAKHI to fetch any Sakhi, not just their ' +
        'own — regression: the SAKHI self-only branch must not run ahead of isPrivileged()',
      async () => {
        repository.findById.mockResolvedValue(rawProfile() as never); // sakhiId: 'user-1'
        const dualRoleCaller = { id: 'manager-1', roles: ['MANAGER', 'SAKHI'], projectId: null };

        await expect(service.getById('user-1', dualRoleCaller)).resolves.toMatchObject({
          sakhiId: 'user-1',
        });
      },
    );
  });

  describe('getManyByIds', () => {
    it('returns an empty array (not a repository call) for an empty id list', async () => {
      await expect(service.getManyByIds([], unscopedCaller)).resolves.toEqual([]);
      expect(repository.findManyByIds).not.toHaveBeenCalled();
    });

    it('returns the projected Sakhis for an unscoped caller (MANAGER/ADMIN)', async () => {
      repository.findManyByIds.mockResolvedValue([rawProfile()] as never);

      const result = await service.getManyByIds(['user-1'], unscopedCaller);

      expect(result).toEqual([expect.objectContaining({ sakhiId: 'user-1' })]);
      expect(repository.findManyByIds).toHaveBeenCalledWith(['user-1']);
    });

    it("scopes a SUPERVISOR caller to only Sakhis in the caller's own project", async () => {
      const ownProjectProfile = { ...rawProfile(), primaryProjectId: 'project-1' };
      const otherProjectProfile = {
        ...rawProfile(),
        primaryProjectId: 'project-2',
        user: { ...rawProfile().user, id: 'user-2', displayName: 'Other Sakhi' },
      };
      repository.findManyByIds.mockResolvedValue([ownProjectProfile, otherProjectProfile] as never);

      const result = await service.getManyByIds(['user-1', 'user-2'], scopedCaller('project-1'));

      expect(result).toEqual([expect.objectContaining({ sakhiId: 'user-1' })]);
    });

    it('silently omits ids that are not found, rather than erroring', async () => {
      repository.findManyByIds.mockResolvedValue([rawProfile()] as never);

      const result = await service.getManyByIds(['user-1', 'missing'], unscopedCaller);

      expect(result).toEqual([expect.objectContaining({ sakhiId: 'user-1' })]);
    });
  });

  describe('getActiveLocationAssignments', () => {
    const ASOF = new Date('2026-09-17');
    const rawAssignment = () => ({
      villageId: 'village-1',
      padaId: 'pada-1',
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
    });

    it('returns the projected assignments for an unscoped caller (MANAGER/ADMIN)', async () => {
      repository.findActiveLocationAssignments.mockResolvedValue([rawAssignment()] as never);

      const result = await service.getActiveLocationAssignments('user-1', unscopedCaller, ASOF);

      expect(result).toEqual([
        expect.objectContaining({ villageId: 'village-1', padaId: 'pada-1' }),
      ]);
      expect(repository.findActiveLocationAssignments).toHaveBeenCalledWith('user-1', ASOF);
      // MANAGER/ADMIN is unrestricted — no profile lookup needed to check project scope.
      expect(repository.findById).not.toHaveBeenCalled();
    });

    it('allows a SAKHI caller to fetch their own assignments', async () => {
      repository.findActiveLocationAssignments.mockResolvedValue([rawAssignment()] as never);
      const sakhiCaller = { id: 'user-1', roles: ['SAKHI'], projectId: null };

      await expect(
        service.getActiveLocationAssignments('user-1', sakhiCaller, ASOF),
      ).resolves.toEqual([expect.objectContaining({ villageId: 'village-1' })]);
    });

    it('rejects a SAKHI caller fetching a different Sakhi', async () => {
      const sakhiCaller = { id: 'user-1', roles: ['SAKHI'], projectId: null };

      await expect(
        service.getActiveLocationAssignments('user-2', sakhiCaller, ASOF),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findActiveLocationAssignments).not.toHaveBeenCalled();
    });

    it('allows a scoped caller (SUPERVISOR) to fetch a Sakhi in their own project', async () => {
      repository.findById.mockResolvedValue(rawProfile() as never); // primaryProjectId: 'project-1'
      repository.findActiveLocationAssignments.mockResolvedValue([rawAssignment()] as never);

      await expect(
        service.getActiveLocationAssignments('user-1', scopedCaller('project-1'), ASOF),
      ).resolves.toEqual([expect.objectContaining({ villageId: 'village-1' })]);
    });

    it(
      'rejects a scoped caller (SUPERVISOR) fetching a Sakhi from a different project — ' +
        'regression: PR #238 review found this cross-project check missing entirely, so a ' +
        "project-scoped SUPERVISOR (neither SAKHI nor privileged) could read any Sakhi's " +
        'location assignments with no scoping at all',
      async () => {
        repository.findById.mockResolvedValue(rawProfile() as never); // primaryProjectId: 'project-1'

        await expect(
          service.getActiveLocationAssignments('user-1', scopedCaller('project-2'), ASOF),
        ).rejects.toMatchObject({ status: 403 });
        expect(repository.findActiveLocationAssignments).not.toHaveBeenCalled();
      },
    );

    it('throws 404 when a scoped caller looks up a Sakhi that does not exist', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.getActiveLocationAssignments('missing', scopedCaller('project-1'), ASOF),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.findActiveLocationAssignments).not.toHaveBeenCalled();
    });

    it(
      "allows a caller holding both MANAGER and SAKHI to fetch any Sakhi's assignments — " +
        'the SAKHI self-only branch must not run ahead of isPrivileged()',
      async () => {
        repository.findActiveLocationAssignments.mockResolvedValue([rawAssignment()] as never);
        const dualRoleCaller = { id: 'manager-1', roles: ['MANAGER', 'SAKHI'], projectId: null };

        await expect(
          service.getActiveLocationAssignments('user-1', dualRoleCaller, ASOF),
        ).resolves.toEqual([expect.objectContaining({ villageId: 'village-1' })]);
        expect(repository.findById).not.toHaveBeenCalled();
      },
    );

    it('returns an empty array (not an error) when the Sakhi has no active assignments', async () => {
      repository.findActiveLocationAssignments.mockResolvedValue([]);

      await expect(
        service.getActiveLocationAssignments('user-1', unscopedCaller, ASOF),
      ).resolves.toEqual([]);
    });
  });

  describe('createLocationAssignment', () => {
    const village = () => ({
      geographyUnitId: 'village-1',
      parentId: 'district-1',
      geoType: 'VILLAGE',
      status: 'ACTIVE',
    });
    const pada = (parentId = 'village-1') => ({
      geographyUnitId: 'pada-1',
      parentId,
      geoType: 'PADA',
      status: 'ACTIVE',
    });
    const input = (overrides = {}) => ({
      villageId: 'village-1',
      padaId: 'pada-1',
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: undefined,
      ...overrides,
    });
    const createdRow = () => ({
      id: 'assignment-1',
      villageId: 'village-1',
      padaId: 'pada-1',
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
    });

    it('creates the assignment when the caller is unscoped (MANAGER/ADMIN)', async () => {
      repository.findById.mockResolvedValue(rawProfile() as never); // primaryProjectId: 'project-1'
      geographyService.assertActiveUnitOfType.mockImplementation(async (id: string) =>
        id === 'village-1' ? (village() as never) : (pada() as never),
      );
      repository.createLocationAssignment.mockResolvedValue(createdRow() as never);

      const result = await service.createLocationAssignment('user-1', input(), unscopedCaller);

      expect(repository.createLocationAssignment).toHaveBeenCalledWith({
        sakhiId: 'user-1',
        projectId: 'project-1',
        villageId: 'village-1',
        padaId: 'pada-1',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
      });
      expect(result).toEqual(expect.objectContaining({ id: 'assignment-1', padaId: 'pada-1' }));
    });

    it(
      "derives projectId from the Sakhi's own primaryProjectId, never from client input — " +
        'security review finding: the create DTO has no projectId field at all now, but this ' +
        "also guards against a stale/malicious caller somehow supplying one, since it's " +
        'never read from `input`',
      async () => {
        repository.findById.mockResolvedValue({
          ...rawProfile(),
          primaryProjectId: 'the-sakhis-real-project',
        } as never);
        geographyService.assertActiveUnitOfType.mockImplementation(async (id: string) =>
          id === 'village-1' ? (village() as never) : (pada() as never),
        );
        repository.createLocationAssignment.mockResolvedValue(createdRow() as never);

        await service.createLocationAssignment(
          'user-1',
          { ...input(), projectId: 'attacker-supplied-project' } as never,
          unscopedCaller,
        );

        expect(repository.createLocationAssignment).toHaveBeenCalledWith(
          expect.objectContaining({ projectId: 'the-sakhis-real-project' }),
        );
      },
    );

    it('allows a scoped caller (SUPERVISOR) to create an assignment for a Sakhi in their own project', async () => {
      repository.findById.mockResolvedValue(rawProfile() as never); // primaryProjectId: 'project-1'
      geographyService.assertActiveUnitOfType.mockImplementation(async (id: string) =>
        id === 'village-1' ? (village() as never) : (pada() as never),
      );
      repository.createLocationAssignment.mockResolvedValue(createdRow() as never);

      await expect(
        service.createLocationAssignment('user-1', input(), scopedCaller('project-1')),
      ).resolves.toEqual(expect.objectContaining({ id: 'assignment-1' }));
    });

    it('rejects a scoped caller (SUPERVISOR) creating for a Sakhi in a different project', async () => {
      repository.findById.mockResolvedValue(rawProfile() as never); // primaryProjectId: 'project-1'

      await expect(
        service.createLocationAssignment('user-1', input(), scopedCaller('project-2')),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.createLocationAssignment).not.toHaveBeenCalled();
    });

    it('rejects a SAKHI caller outright — write access is never granted to SAKHI', async () => {
      const sakhiCaller = { id: 'user-1', roles: ['SAKHI'], projectId: null };

      await expect(
        service.createLocationAssignment('user-1', input(), sakhiCaller),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.createLocationAssignment).not.toHaveBeenCalled();
    });

    it('rejects when villageId does not reference an ACTIVE VILLAGE geography unit', async () => {
      geographyService.assertActiveUnitOfType.mockRejectedValue(
        badRequest('Must reference an active VILLAGE geography unit.'),
      );

      await expect(
        service.createLocationAssignment('user-1', input(), unscopedCaller),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.createLocationAssignment).not.toHaveBeenCalled();
    });

    it('rejects when padaId does not reference an ACTIVE PADA geography unit', async () => {
      geographyService.assertActiveUnitOfType.mockImplementation(async (id: string) => {
        if (id === 'village-1') return village() as never;
        throw badRequest('Must reference an active PADA geography unit.');
      });

      await expect(
        service.createLocationAssignment('user-1', input(), unscopedCaller),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.createLocationAssignment).not.toHaveBeenCalled();
    });

    it("rejects when padaId's parentId does not match the given villageId", async () => {
      geographyService.assertActiveUnitOfType.mockImplementation(async (id: string) =>
        id === 'village-1' ? (village() as never) : (pada('some-other-village') as never),
      );

      await expect(
        service.createLocationAssignment('user-1', input(), unscopedCaller),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.createLocationAssignment).not.toHaveBeenCalled();
    });

    it('rejects when effectiveTo is before effectiveFrom', async () => {
      geographyService.assertActiveUnitOfType.mockImplementation(async (id: string) =>
        id === 'village-1' ? (village() as never) : (pada() as never),
      );

      await expect(
        service.createLocationAssignment(
          'user-1',
          input({ effectiveTo: new Date('2025-12-31') }),
          unscopedCaller,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.createLocationAssignment).not.toHaveBeenCalled();
    });

    it('allows creating without a padaId (village-only assignment)', async () => {
      geographyService.assertActiveUnitOfType.mockResolvedValue(village() as never);
      repository.createLocationAssignment.mockResolvedValue({
        ...createdRow(),
        padaId: null,
      } as never);

      await service.createLocationAssignment(
        'user-1',
        input({ padaId: undefined }),
        unscopedCaller,
      );

      expect(repository.createLocationAssignment).toHaveBeenCalledWith(
        expect.objectContaining({ padaId: null }),
      );
    });
  });

  describe('updateLocationAssignment', () => {
    const existingRow = () => ({
      id: 'assignment-1',
      sakhiId: 'user-1',
      villageId: 'village-1',
      padaId: 'pada-1',
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
    });
    const pada = (parentId = 'village-1') => ({
      geographyUnitId: 'pada-2',
      parentId,
      geoType: 'PADA',
      status: 'ACTIVE',
    });

    it('updates the assignment when the caller is unscoped (MANAGER/ADMIN)', async () => {
      repository.findLocationAssignmentById.mockResolvedValue(existingRow() as never);
      repository.updateLocationAssignment.mockResolvedValue({
        ...existingRow(),
        effectiveTo: new Date('2026-06-01'),
      } as never);

      const result = await service.updateLocationAssignment(
        'user-1',
        'assignment-1',
        { effectiveTo: new Date('2026-06-01') },
        unscopedCaller,
      );

      expect(repository.updateLocationAssignment).toHaveBeenCalledWith('assignment-1', {
        villageId: undefined,
        padaId: undefined,
        effectiveFrom: undefined,
        effectiveTo: new Date('2026-06-01'),
      });
      expect(result).toEqual(expect.objectContaining({ id: 'assignment-1' }));
    });

    it('throws 404 when the assignment does not exist', async () => {
      repository.findLocationAssignmentById.mockResolvedValue(null);

      await expect(
        service.updateLocationAssignment('user-1', 'missing', {}, unscopedCaller),
      ).rejects.toMatchObject({ status: 404 });
    });

    it(
      'throws 404 when the assignment exists but belongs to a different Sakhi — a caller ' +
        "cannot edit another Sakhi's assignment by supplying an unrelated sakhiId in the URL",
      async () => {
        repository.findLocationAssignmentById.mockResolvedValue({
          ...existingRow(),
          sakhiId: 'other-sakhi',
        } as never);

        await expect(
          service.updateLocationAssignment('user-1', 'assignment-1', {}, unscopedCaller),
        ).rejects.toMatchObject({ status: 404 });
        expect(repository.updateLocationAssignment).not.toHaveBeenCalled();
      },
    );

    it('rejects a SAKHI caller outright', async () => {
      const sakhiCaller = { id: 'user-1', roles: ['SAKHI'], projectId: null };

      await expect(
        service.updateLocationAssignment('user-1', 'assignment-1', {}, sakhiCaller),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findLocationAssignmentById).not.toHaveBeenCalled();
    });

    it('rejects a scoped caller (SUPERVISOR) editing a Sakhi from a different project', async () => {
      repository.findById.mockResolvedValue(rawProfile() as never); // primaryProjectId: 'project-1'

      await expect(
        service.updateLocationAssignment('user-1', 'assignment-1', {}, scopedCaller('project-2')),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findLocationAssignmentById).not.toHaveBeenCalled();
    });

    it('re-validates villageId/padaId when either is being changed', async () => {
      repository.findLocationAssignmentById.mockResolvedValue(existingRow() as never);
      geographyService.assertActiveUnitOfType.mockRejectedValue(
        badRequest('Must reference an active VILLAGE geography unit.'),
      );

      await expect(
        service.updateLocationAssignment(
          'user-1',
          'assignment-1',
          { villageId: 'new-village' },
          unscopedCaller,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.updateLocationAssignment).not.toHaveBeenCalled();
    });

    it('does not re-validate geography when neither villageId nor padaId is being changed', async () => {
      repository.findLocationAssignmentById.mockResolvedValue(existingRow() as never);
      repository.updateLocationAssignment.mockResolvedValue(existingRow() as never);

      await service.updateLocationAssignment(
        'user-1',
        'assignment-1',
        { effectiveFrom: new Date('2026-02-01') },
        unscopedCaller,
      );

      expect(geographyService.assertActiveUnitOfType).not.toHaveBeenCalled();
    });

    it(
      'validates only padaId (not villageId) when an edit changes padaId but leaves the ' +
        'existing, unchanged villageId alone — regression: previously re-checking the ' +
        'unchanged villageId could wrongly 400 an edit that never touched it if that ' +
        'village was deactivated after the assignment was created',
      async () => {
        repository.findLocationAssignmentById.mockResolvedValue(existingRow() as never);
        geographyService.assertActiveUnitOfType.mockResolvedValue(pada() as never);
        repository.updateLocationAssignment.mockResolvedValue({
          ...existingRow(),
          padaId: 'pada-2',
        } as never);

        await service.updateLocationAssignment(
          'user-1',
          'assignment-1',
          { padaId: 'pada-2' },
          unscopedCaller,
        );

        expect(geographyService.assertActiveUnitOfType).toHaveBeenCalledWith('pada-2', 'PADA');
        expect(geographyService.assertActiveUnitOfType).not.toHaveBeenCalledWith(
          'village-1',
          'VILLAGE',
        );
      },
    );

    it('rejects when the resulting effectiveTo would be before the resulting effectiveFrom', async () => {
      repository.findLocationAssignmentById.mockResolvedValue(existingRow() as never);

      await expect(
        service.updateLocationAssignment(
          'user-1',
          'assignment-1',
          { effectiveFrom: new Date('2026-12-01'), effectiveTo: new Date('2026-01-01') },
          unscopedCaller,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.updateLocationAssignment).not.toHaveBeenCalled();
    });
  });

  describe('endLocationAssignment', () => {
    const existingRow = () => ({
      id: 'assignment-1',
      sakhiId: 'user-1',
      villageId: 'village-1',
      padaId: 'pada-1',
      effectiveFrom: new Date('2026-01-01'),
      effectiveTo: null,
    });

    it('ends the assignment with the given effectiveTo', async () => {
      repository.findLocationAssignmentById.mockResolvedValue(existingRow() as never);
      repository.endLocationAssignment.mockResolvedValue({
        ...existingRow(),
        effectiveTo: new Date('2026-06-01'),
      } as never);

      const result = await service.endLocationAssignment(
        'user-1',
        'assignment-1',
        new Date('2026-06-01'),
        unscopedCaller,
      );

      expect(repository.endLocationAssignment).toHaveBeenCalledWith(
        'assignment-1',
        new Date('2026-06-01'),
      );
      expect(result).toEqual(expect.objectContaining({ effectiveTo: new Date('2026-06-01') }));
    });

    it('defaults effectiveTo to today when omitted', async () => {
      repository.findLocationAssignmentById.mockResolvedValue(existingRow() as never);
      repository.endLocationAssignment.mockResolvedValue(existingRow() as never);

      await service.endLocationAssignment('user-1', 'assignment-1', undefined, unscopedCaller);

      const calledWith = repository.endLocationAssignment.mock.calls[0][1] as Date;
      expect(calledWith.getTime()).toBeGreaterThan(Date.now() - 5000);
    });

    it('throws 404 when the assignment does not exist', async () => {
      repository.findLocationAssignmentById.mockResolvedValue(null);

      await expect(
        service.endLocationAssignment('user-1', 'missing', undefined, unscopedCaller),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('throws 404 when the assignment belongs to a different Sakhi than the one in the URL', async () => {
      repository.findLocationAssignmentById.mockResolvedValue({
        ...existingRow(),
        sakhiId: 'other-sakhi',
      } as never);

      await expect(
        service.endLocationAssignment('user-1', 'assignment-1', undefined, unscopedCaller),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('rejects a SAKHI caller outright', async () => {
      const sakhiCaller = { id: 'user-1', roles: ['SAKHI'], projectId: null };

      await expect(
        service.endLocationAssignment('user-1', 'assignment-1', undefined, sakhiCaller),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findLocationAssignmentById).not.toHaveBeenCalled();
    });

    it("rejects when the given effectiveTo is before the assignment's own effectiveFrom", async () => {
      repository.findLocationAssignmentById.mockResolvedValue(existingRow() as never);

      await expect(
        service.endLocationAssignment(
          'user-1',
          'assignment-1',
          new Date('2025-01-01'),
          unscopedCaller,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.endLocationAssignment).not.toHaveBeenCalled();
    });
  });
});
