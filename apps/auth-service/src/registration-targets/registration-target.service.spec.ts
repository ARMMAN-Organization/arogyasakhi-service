import type { AuthenticatedUser } from '@armman/service-commons';
import { RegistrationTargetService } from './registration-target.service';
import type { RegistrationTargetRepository } from './registration-target.repository';
import type { SakhiRepository } from '../sakhis/sakhi.repository';

function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: 'sakhi-1',
    roles: ['SAKHI'],
    projectId: null,
    geographyUnitId: null,
    ...overrides,
  };
}

describe('RegistrationTargetService', () => {
  const repository = {
    findBySakhiId: jest.fn(),
  } as unknown as jest.Mocked<RegistrationTargetRepository>;
  const sakhiRepository = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<SakhiRepository>;

  let service: RegistrationTargetService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RegistrationTargetService(repository, sakhiRepository);
  });

  const rawRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'target-1',
    sakhiId: 'sakhi-1',
    projectId: 'project-1',
    targetPeriodStart: new Date('2026-04-01'),
    targetPeriodEnd: new Date('2026-06-30'),
    registrationTarget: 25,
    createdByUserId: 'admin-1',
    updatedByUserId: 'admin-1',
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  });

  describe('list', () => {
    it('returns the projected targets for a Sakhi requesting her own id', async () => {
      repository.findBySakhiId.mockResolvedValue([rawRow()] as never);

      const result = await service.list('sakhi-1', caller({ id: 'sakhi-1', roles: ['SAKHI'] }));

      expect(result).toEqual([
        {
          id: 'target-1',
          sakhiId: 'sakhi-1',
          projectId: 'project-1',
          targetPeriodStart: new Date('2026-04-01'),
          targetPeriodEnd: new Date('2026-06-30'),
          registrationTarget: 25,
        },
      ]);
      expect(result[0]).not.toHaveProperty('isDeleted');
      expect(result[0]).not.toHaveProperty('createdByUserId');
    });

    it('returns multiple target rows for a Sakhi with more than one period', async () => {
      const rowA = rawRow({ id: 'target-1', targetPeriodStart: new Date('2026-04-01') });
      const rowB = rawRow({ id: 'target-2', targetPeriodStart: new Date('2026-07-01') });
      repository.findBySakhiId.mockResolvedValue([rowA, rowB] as never);

      const result = await service.list('sakhi-1', caller({ id: 'sakhi-1', roles: ['SAKHI'] }));

      expect(result).toHaveLength(2);
    });

    it('returns an empty array (not an error) when the Sakhi has no targets', async () => {
      repository.findBySakhiId.mockResolvedValue([]);
      await expect(
        service.list('sakhi-1', caller({ id: 'sakhi-1', roles: ['SAKHI'] })),
      ).resolves.toEqual([]);
    });

    it('handles a null registrationTarget (target not yet set for the period)', async () => {
      repository.findBySakhiId.mockResolvedValue([rawRow({ registrationTarget: null })] as never);
      const result = await service.list('sakhi-1', caller({ id: 'sakhi-1', roles: ['SAKHI'] }));
      expect(result[0].registrationTarget).toBeNull();
    });

    it('403s when a SAKHI caller requests a sakhiId that is not her own', async () => {
      await expect(
        service.list('some-other-sakhi', caller({ id: 'sakhi-1', roles: ['SAKHI'] })),
      ).rejects.toThrow('You do not have access to this Sakhi.');
      expect(repository.findBySakhiId).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR caller to request a Sakhi assigned to them', async () => {
      sakhiRepository.findById.mockResolvedValue({ supervisorId: 'supervisor-1' } as never);
      repository.findBySakhiId.mockResolvedValue([]);

      await service.list('sakhi-1', caller({ id: 'supervisor-1', roles: ['SUPERVISOR'] }));

      expect(repository.findBySakhiId).toHaveBeenCalledWith('sakhi-1');
    });

    it('403s a SUPERVISOR caller requesting a Sakhi not assigned to them', async () => {
      sakhiRepository.findById.mockResolvedValue({ supervisorId: 'someone-else' } as never);

      await expect(
        service.list('sakhi-1', caller({ id: 'supervisor-1', roles: ['SUPERVISOR'] })),
      ).rejects.toThrow('You do not have access to this Sakhi.');
      expect(repository.findBySakhiId).not.toHaveBeenCalled();
    });

    it('404s a SUPERVISOR caller requesting an unknown sakhiId', async () => {
      sakhiRepository.findById.mockResolvedValue(null);

      await expect(
        service.list('missing-sakhi', caller({ id: 'supervisor-1', roles: ['SUPERVISOR'] })),
      ).rejects.toThrow('Sakhi not found.');
    });

    it('leaves a MANAGER/ADMIN caller unscoped', async () => {
      repository.findBySakhiId.mockResolvedValue([]);

      await service.list('any-sakhi', caller({ roles: ['MANAGER'] }));

      expect(sakhiRepository.findById).not.toHaveBeenCalled();
      expect(repository.findBySakhiId).toHaveBeenCalledWith('any-sakhi');
    });
  });
});
