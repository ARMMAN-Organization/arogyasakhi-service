import { FormRepository } from './form.repository';

describe('FormRepository', () => {
  const findFirst = jest.fn();
  const prisma = { visitInstance: { findFirst } } as never;
  let repository: FormRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new FormRepository(prisma);
  });

  describe('findVisitById', () => {
    it('returns the visit row when it exists and is not deleted', async () => {
      const visit = { id: 'visit-1', isDeleted: false };
      findFirst.mockResolvedValue(visit);

      const result = await repository.findVisitById('visit-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'visit-1', isDeleted: false },
      });
      expect(result).toBe(visit);
    });

    it('returns null when no matching visit exists', async () => {
      findFirst.mockResolvedValue(null);

      const result = await repository.findVisitById('missing-id');

      expect(result).toBeNull();
    });
  });
});
