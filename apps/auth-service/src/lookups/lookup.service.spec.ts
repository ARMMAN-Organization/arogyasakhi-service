import { LookupService } from './lookup.service';
import type { LookupRepository } from './lookup.repository';

describe('LookupService', () => {
  const repository = {
    findAllCategoriesWithValues: jest.fn(),
    findCategoryByCode: jest.fn(),
    findValueById: jest.fn(),
    createValue: jest.fn(),
    updateValue: jest.fn(),
  } as unknown as jest.Mocked<LookupRepository>;

  let service: LookupService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LookupService(repository);
  });

  describe('listAll', () => {
    it('returns every category (projected) with its nested values (projected)', async () => {
      const categories = [
        {
          id: 'cat-1',
          categoryCode: 'RISK_GRADE',
          createdByUserId: 'u',
          values: [
            { id: 'val-1', valueCode: 'HIGH', createdByUserId: 'u', lookupCategoryId: 'cat-1' },
          ],
        },
      ];
      repository.findAllCategoriesWithValues.mockResolvedValue(categories as never);

      const result = await service.listAll();
      expect(result[0]).toEqual(
        expect.objectContaining({ id: 'cat-1', categoryCode: 'RISK_GRADE' }),
      );
      expect(result[0]).not.toHaveProperty('createdByUserId');
      expect(result[0].values[0]).toEqual(
        expect.objectContaining({ id: 'val-1', valueCode: 'HIGH' }),
      );
      expect(result[0].values[0]).not.toHaveProperty('createdByUserId');
      expect(result[0].values[0]).not.toHaveProperty('lookupCategoryId');
    });
  });

  describe('getByCategoryCode', () => {
    it('returns values for one category', async () => {
      const category = { id: 'cat-1', categoryCode: 'RISK_GRADE', values: [] };
      repository.findCategoryByCode.mockResolvedValue(category as never);

      await expect(service.getByCategoryCode('RISK_GRADE')).resolves.toEqual(
        expect.objectContaining({ id: 'cat-1', categoryCode: 'RISK_GRADE', values: [] }),
      );
    });

    it('throws 404 for an unknown category code', async () => {
      repository.findCategoryByCode.mockResolvedValue(null);

      await expect(service.getByCategoryCode('NOPE')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('createValue', () => {
    const category = { id: 'cat-1', categoryCode: 'RISK_GRADE' };

    it('creates a value under an existing category', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      const created = { id: 'val-1', lookupCategoryId: 'cat-1', valueCode: 'HIGH' };
      repository.createValue.mockResolvedValue(created as never);

      const input = { valueCode: 'HIGH', valueLabel: 'High' };
      const res = await service.createValue('RISK_GRADE', input);
      expect(res).toEqual(expect.objectContaining({ id: 'val-1', valueCode: 'HIGH' }));
      expect(res).not.toHaveProperty('lookupCategoryId');
      expect(repository.createValue).toHaveBeenCalledWith('cat-1', input);
    });

    it('throws 404 when the category code does not exist', async () => {
      repository.findCategoryByCode.mockResolvedValue(null);

      await expect(
        service.createValue('NOPE', { valueCode: 'HIGH', valueLabel: 'High' }),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.createValue).not.toHaveBeenCalled();
    });

    it('throws 409 on a duplicate value code within the same category', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.createValue.mockRejectedValue({ code: 'P2002' });

      await expect(
        service.createValue('RISK_GRADE', { valueCode: 'HIGH', valueLabel: 'High' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('succeeds when parentLookupValueId belongs to the same category', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValueById.mockResolvedValue({
        id: 'parent-1',
        lookupCategoryId: 'cat-1',
      } as never);
      const created = { id: 'val-2' };
      repository.createValue.mockResolvedValue(created as never);

      const input = { valueCode: 'SUB', valueLabel: 'Sub', parentLookupValueId: 'parent-1' };
      await expect(service.createValue('RISK_GRADE', input)).resolves.toEqual(
        expect.objectContaining({ id: 'val-2' }),
      );
    });

    it('throws 422 when parentLookupValueId belongs to a different category', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValueById.mockResolvedValue({
        id: 'parent-1',
        lookupCategoryId: 'other-cat',
      } as never);

      const input = { valueCode: 'SUB', valueLabel: 'Sub', parentLookupValueId: 'parent-1' };
      await expect(service.createValue('RISK_GRADE', input)).rejects.toMatchObject({
        status: 422,
      });
      expect(repository.createValue).not.toHaveBeenCalled();
    });
  });

  describe('updateValue', () => {
    it('updates fields and returns the updated value', async () => {
      const updated = { id: 'val-1', valueLabel: 'Renamed' };
      repository.updateValue.mockResolvedValue(updated as never);

      await expect(service.updateValue('val-1', { valueLabel: 'Renamed' })).resolves.toEqual(
        expect.objectContaining({ id: 'val-1', valueLabel: 'Renamed' }),
      );
    });

    it('throws 404 when the lookup value does not exist', async () => {
      repository.updateValue.mockResolvedValue(null);

      await expect(service.updateValue('missing', { valueLabel: 'Renamed' })).rejects.toMatchObject(
        { status: 404 },
      );
    });

    it('throws 422 when the new parentLookupValueId belongs to a different category', async () => {
      repository.findValueById.mockImplementation(
        (id: string) =>
          Promise.resolve(
            id === 'val-1'
              ? { id: 'val-1', lookupCategoryId: 'cat-1' }
              : { id: 'parent-1', lookupCategoryId: 'other-cat' },
          ) as never,
      );

      await expect(
        service.updateValue('val-1', { parentLookupValueId: 'parent-1' }),
      ).rejects.toMatchObject({ status: 422 });
      expect(repository.updateValue).not.toHaveBeenCalled();
    });
  });
});
