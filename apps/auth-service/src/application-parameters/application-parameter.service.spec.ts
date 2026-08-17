import { ApplicationParameterService } from './application-parameter.service';
import type { ApplicationParameterRepository } from './application-parameter.repository';

describe('ApplicationParameterService', () => {
  const repository = {
    findAllActive: jest.fn(),
    findActiveByKey: jest.fn(),
  } as unknown as jest.Mocked<ApplicationParameterRepository>;

  let service: ApplicationParameterService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ApplicationParameterService(repository);
  });

  const rawRow = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'param-1',
    paramKey: 'SYNC_INTERVAL_MINUTES',
    paramValue: '15',
    description: 'Minutes between background sync attempts.',
    isActive: true,
    createdAt: new Date('2026-04-01'),
    createdByUserId: 'admin-1',
    updatedAt: new Date('2026-04-01'),
    updatedByUserId: 'admin-1',
    ...overrides,
  });

  describe('list', () => {
    it('returns an empty array when there are no parameters', async () => {
      repository.findAllActive.mockResolvedValue([]);
      await expect(service.list()).resolves.toEqual([]);
    });

    it('returns the projected rows when parameters exist', async () => {
      repository.findAllActive.mockResolvedValue([rawRow()] as never);

      const result = await service.list();

      expect(result).toEqual([
        {
          id: 'param-1',
          paramKey: 'SYNC_INTERVAL_MINUTES',
          paramValue: '15',
          description: 'Minutes between background sync attempts.',
          isActive: true,
        },
      ]);
      expect(result[0]).not.toHaveProperty('createdByUserId');
      expect(result[0]).not.toHaveProperty('updatedByUserId');
      expect(result[0]).not.toHaveProperty('createdAt');
      expect(result[0]).not.toHaveProperty('updatedAt');
    });

    it('returns multiple rows in the order the repository provides', async () => {
      repository.findAllActive.mockResolvedValue([
        rawRow({ id: 'param-1', paramKey: 'A_KEY' }),
        rawRow({ id: 'param-2', paramKey: 'B_KEY' }),
      ] as never);

      const result = await service.list();

      expect(result.map((r) => r.paramKey)).toEqual(['A_KEY', 'B_KEY']);
    });
  });

  describe('getByKey', () => {
    it('returns the projected row for an existing key', async () => {
      repository.findActiveByKey.mockResolvedValue(rawRow() as never);

      const result = await service.getByKey('SYNC_INTERVAL_MINUTES');

      expect(result).toEqual({
        id: 'param-1',
        paramKey: 'SYNC_INTERVAL_MINUTES',
        paramValue: '15',
        description: 'Minutes between background sync attempts.',
        isActive: true,
      });
      expect(repository.findActiveByKey).toHaveBeenCalledWith('SYNC_INTERVAL_MINUTES');
    });

    it('throws a 404 HttpError when the key does not exist', async () => {
      repository.findActiveByKey.mockResolvedValue(null);

      await expect(service.getByKey('UNKNOWN_KEY')).rejects.toMatchObject({
        status: 404,
        message: 'Application parameter not found.',
      });
    });
  });
});
