import { SakhiService } from './sakhi.service';
import type { SakhiRepository } from './sakhi.repository';

describe('SakhiService', () => {
  const repository = {
    findByProject: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<SakhiRepository>;

  let service: SakhiService;

  const unscopedCaller = { id: 'admin-1', roles: ['ADMIN'], projectId: null };
  const scopedCaller = (projectId: string, id = 'supervisor-1') => ({
    id,
    roles: ['SUPERVISOR'],
    projectId,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new SakhiService(repository);
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
  });
});
