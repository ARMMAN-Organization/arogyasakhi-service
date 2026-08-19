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
    it('returns the visit row when it exists, belongs to the given beneficiary, and is not deleted', async () => {
      const visit = { id: 'visit-1', beneficiaryId: 'b1', isDeleted: false };
      findFirst.mockResolvedValue(visit);

      const result = await repository.findVisitById('visit-1', 'b1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'visit-1', beneficiaryId: 'b1', isDeleted: false },
      });
      expect(result).toBe(visit);
    });

    it('returns null when no matching visit exists', async () => {
      findFirst.mockResolvedValue(null);

      const result = await repository.findVisitById('missing-id', 'b1');

      expect(result).toBeNull();
    });

    it('filters on beneficiaryId — a real visit belonging to a different beneficiary does not match', async () => {
      // The mocked findFirst always resolves what it's told to, so this test
      // asserts the *query shape* includes beneficiaryId rather than
      // simulating Prisma's own filtering — the real enforcement is the
      // database query, not application code.
      findFirst.mockResolvedValue(null);

      await repository.findVisitById('visit-1', 'wrong-beneficiary');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'visit-1', beneficiaryId: 'wrong-beneficiary', isDeleted: false },
      });
    });
  });
});
