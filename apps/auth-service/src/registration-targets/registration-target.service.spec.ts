import { RegistrationTargetService } from './registration-target.service';
import type { RegistrationTargetRepository } from './registration-target.repository';

describe('RegistrationTargetService', () => {
  const repository = {
    findBySakhiId: jest.fn(),
  } as unknown as jest.Mocked<RegistrationTargetRepository>;

  let service: RegistrationTargetService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new RegistrationTargetService(repository);
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
    it('returns the projected targets for a Sakhi', async () => {
      repository.findBySakhiId.mockResolvedValue([rawRow()] as never);

      const result = await service.list('sakhi-1');

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

      const result = await service.list('sakhi-1');

      expect(result).toHaveLength(2);
    });

    it('returns an empty array (not an error) when the Sakhi has no targets', async () => {
      repository.findBySakhiId.mockResolvedValue([]);
      await expect(service.list('sakhi-with-no-targets')).resolves.toEqual([]);
    });

    it('returns an empty array (not a 404) for an unknown sakhiId', async () => {
      repository.findBySakhiId.mockResolvedValue([]);
      await expect(service.list('missing-sakhi')).resolves.toEqual([]);
    });

    it('handles a null registrationTarget (target not yet set for the period)', async () => {
      repository.findBySakhiId.mockResolvedValue([rawRow({ registrationTarget: null })] as never);
      const result = await service.list('sakhi-1');
      expect(result[0].registrationTarget).toBeNull();
    });
  });
});
