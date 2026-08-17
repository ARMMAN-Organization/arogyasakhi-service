import { ApplicationParameterRepository } from './application-parameter.repository';

describe('ApplicationParameterRepository', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const prisma = { applicationParameter: { findMany, findFirst } } as never;
  let repository: ApplicationParameterRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new ApplicationParameterRepository(prisma);
  });

  describe('findAllActive', () => {
    it('queries only active parameters, ordered by paramKey', async () => {
      findMany.mockResolvedValue([]);

      await repository.findAllActive();

      expect(findMany).toHaveBeenCalledWith({
        where: { isActive: true },
        orderBy: { paramKey: 'asc' },
      });
    });

    it('returns an empty array when no parameters exist', async () => {
      findMany.mockResolvedValue([]);
      const result = await repository.findAllActive();
      expect(result).toEqual([]);
    });
  });

  describe('findActiveByKey', () => {
    it('queries an active parameter by its key', async () => {
      findFirst.mockResolvedValue(null);

      await repository.findActiveByKey('SYNC_INTERVAL_MINUTES');

      expect(findFirst).toHaveBeenCalledWith({
        where: { paramKey: 'SYNC_INTERVAL_MINUTES', isActive: true },
      });
    });

    it('returns null when the key does not exist', async () => {
      findFirst.mockResolvedValue(null);
      const result = await repository.findActiveByKey('UNKNOWN_KEY');
      expect(result).toBeNull();
    });
  });
});
