import { ArogyaSakhiRosterService } from './arogya-sakhi-roster.service';
import type { ArogyaSakhiRosterRepository } from './arogya-sakhi-roster.repository';

describe('ArogyaSakhiRosterService', () => {
  const repository = {
    findByProject: jest.fn(),
  } as unknown as jest.Mocked<ArogyaSakhiRosterRepository>;

  let service: ArogyaSakhiRosterService;

  const unscopedCaller = { id: 'admin-1', roles: ['ADMIN'], projectId: null };
  const scopedCaller = (projectId: string, id = 'supervisor-1') => ({
    id,
    roles: ['SUPERVISOR'],
    projectId,
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ArogyaSakhiRosterService(repository);
  });

  const rawProfile = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'profile-1',
    userId: 'user-1',
    employeeCode: 'EMP-00123',
    phoneNumber: '+919000000123',
    primaryProjectId: 'project-1',
    supervisorId: 'supervisor-1',
    activeFrom: new Date('2026-04-01'),
    activeTo: null,
    panToken: Buffer.from('secret'),
    aadhaarToken: Buffer.from('secret'),
    bankAccountToken: Buffer.from('secret'),
    ifscCode: 'HDFC0000123',
    backupContact: '+919000000999',
    user: {
      id: 'user-1',
      displayName: 'Priya Sharma',
      username: 'priya.sharma',
      status: 'ACTIVE',
      passwordHash: 'hashed',
    },
    ...overrides,
  });

  describe('listByProject', () => {
    it('returns the projected roster for a project, never leaking PII/financial fields', async () => {
      repository.findByProject.mockResolvedValue([rawProfile()] as never);

      const result = await service.listByProject('project-1', unscopedCaller);

      expect(result).toEqual([
        {
          id: 'profile-1',
          userId: 'user-1',
          displayName: 'Priya Sharma',
          username: 'priya.sharma',
          mobileNumber: '+919000000123',
          employeeCode: 'EMP-00123',
          supervisorId: 'supervisor-1',
          primaryProjectId: 'project-1',
          activeFrom: new Date('2026-04-01'),
          activeTo: null,
          status: 'ACTIVE',
        },
      ]);
      expect(result[0]).not.toHaveProperty('panToken');
      expect(result[0]).not.toHaveProperty('aadhaarToken');
      expect(result[0]).not.toHaveProperty('bankAccountToken');
      expect(result[0]).not.toHaveProperty('ifscCode');
      expect(result[0]).not.toHaveProperty('backupContact');
      expect(result[0]).not.toHaveProperty('passwordHash');
    });

    it('returns an empty array (not an error) when the project has no Sakhis', async () => {
      repository.findByProject.mockResolvedValue([]);
      await expect(
        service.listByProject('project-with-no-sakhis', unscopedCaller),
      ).resolves.toEqual([]);
    });

    it('allows a caller with no project scope (MANAGER/ADMIN) to download any project roster', async () => {
      repository.findByProject.mockResolvedValue([]);
      await expect(service.listByProject('project-1', unscopedCaller)).resolves.toEqual([]);
      expect(repository.findByProject).toHaveBeenCalledWith('project-1');
    });

    it('allows a scoped caller (SUPERVISOR) to download their own project roster', async () => {
      repository.findByProject.mockResolvedValue([]);
      await expect(service.listByProject('project-1', scopedCaller('project-1'))).resolves.toEqual(
        [],
      );
    });

    it('rejects a scoped caller downloading a different project roster', async () => {
      await expect(
        service.listByProject('project-1', scopedCaller('project-2')),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.findByProject).not.toHaveBeenCalled();
    });

    it('does not scope a SUPERVISOR caller down to their own assigned Sakhis — returns the whole project roster', async () => {
      const ownProfile = rawProfile({ supervisorId: 'supervisor-1' });
      const otherProfile = rawProfile({
        supervisorId: 'other-supervisor',
        user: { ...rawProfile().user, id: 'user-2', displayName: 'Other Sakhi' },
      });
      repository.findByProject.mockResolvedValue([ownProfile, otherProfile] as never);

      const result = await service.listByProject('project-1', scopedCaller('project-1'));

      expect(result).toHaveLength(2);
    });
  });
});
