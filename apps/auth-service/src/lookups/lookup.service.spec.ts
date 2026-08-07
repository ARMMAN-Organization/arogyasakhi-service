import { LookupService } from './lookup.service';
import type { LookupRepository } from './lookup.repository';

describe('LookupService', () => {
  const repository = {
    findAllCategoriesWithValues: jest.fn(),
    findCategoryByCode: jest.fn(),
    findValueById: jest.fn(),
    createValue: jest.fn(),
    updateValue: jest.fn(),
    findValuesByCategoryId: jest.fn(),
    bulkUpsertValues: jest.fn(),
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

  describe('bulkUpsertValues', () => {
    const category = { id: 'cat-1', categoryCode: 'EDUCATION_LEVEL' };

    it('creates every valueCode not already present in the category', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValuesByCategoryId.mockResolvedValue([] as never);

      const input = { values: [{ valueCode: 'TENTH_PASS', valueLabel: '10th Pass' }] };
      const result = await service.bulkUpsertValues('EDUCATION_LEVEL', input);

      expect(result).toEqual({ created: ['TENTH_PASS'], updated: [], unchanged: [] });
      expect(repository.bulkUpsertValues).toHaveBeenCalledWith('cat-1', input.values, []);
    });

    it('reports no-op writes as unchanged when valueLabel/sortOrder already match', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValuesByCategoryId.mockResolvedValue([
        { id: 'val-1', valueCode: 'GRADUATE', valueLabel: 'Graduate', sortOrder: 4, parentLookupValueId: null },
      ] as never);

      const input = { values: [{ valueCode: 'GRADUATE', valueLabel: 'Graduate', sortOrder: 4 }] };
      const result = await service.bulkUpsertValues('EDUCATION_LEVEL', input);

      expect(result).toEqual({ created: [], updated: [], unchanged: ['GRADUATE'] });
      expect(repository.bulkUpsertValues).not.toHaveBeenCalled();
    });

    it('updates only valueCodes whose valueLabel or sortOrder differ', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValuesByCategoryId.mockResolvedValue([
        { id: 'val-1', valueCode: 'PRIMARY', valueLabel: 'Primary', sortOrder: 1, parentLookupValueId: null },
      ] as never);

      const input = {
        values: [{ valueCode: 'PRIMARY', valueLabel: 'Primary education (Class 1-5)', sortOrder: 1 }],
      };
      const result = await service.bulkUpsertValues('EDUCATION_LEVEL', input);

      expect(result).toEqual({ created: [], updated: ['PRIMARY'], unchanged: [] });
      expect(repository.bulkUpsertValues).toHaveBeenCalledWith(
        'cat-1',
        [],
        [{ id: 'val-1', data: input.values[0] }],
      );
    });

    it('splits a mixed payload into created/updated/unchanged in one call', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValuesByCategoryId.mockResolvedValue([
        { id: 'val-1', valueCode: 'PRIMARY', valueLabel: 'Primary', sortOrder: 1, parentLookupValueId: null },
        { id: 'val-2', valueCode: 'GRADUATE', valueLabel: 'Graduate', sortOrder: 4, parentLookupValueId: null },
      ] as never);

      const input = {
        values: [
          { valueCode: 'PRIMARY', valueLabel: 'Primary education (Class 1-5)', sortOrder: 1 },
          { valueCode: 'GRADUATE', valueLabel: 'Graduate', sortOrder: 4 },
          { valueCode: 'TENTH_PASS', valueLabel: '10th Pass', sortOrder: 8 },
        ],
      };
      const result = await service.bulkUpsertValues('EDUCATION_LEVEL', input);

      expect(result).toEqual({
        created: ['TENTH_PASS'],
        updated: ['PRIMARY'],
        unchanged: ['GRADUATE'],
      });
    });

    it('creates a value with parentLookupValueId when it belongs to the same category', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValuesByCategoryId.mockResolvedValue([] as never);
      repository.findValueById.mockResolvedValue({ id: 'parent-1', lookupCategoryId: 'cat-1' } as never);

      const input = {
        values: [{ valueCode: 'SUB', valueLabel: 'Sub', parentLookupValueId: 'parent-1' }],
      };
      const result = await service.bulkUpsertValues('EDUCATION_LEVEL', input);

      expect(result.created).toEqual(['SUB']);
    });

    it('never touches an existing value absent from the payload', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValuesByCategoryId.mockResolvedValue([
        { id: 'val-1', valueCode: 'ILLITERATE', valueLabel: 'Illiterate', sortOrder: 0, parentLookupValueId: null },
      ] as never);

      const input = { values: [{ valueCode: 'TENTH_PASS', valueLabel: '10th Pass' }] };
      const result = await service.bulkUpsertValues('EDUCATION_LEVEL', input);

      expect(result.unchanged).not.toContain('ILLITERATE');
      expect(result.updated).not.toContain('ILLITERATE');
      expect(repository.bulkUpsertValues).toHaveBeenCalledWith(
        'cat-1',
        [{ valueCode: 'TENTH_PASS', valueLabel: '10th Pass' }],
        [],
      );
    });

    it('is idempotent: running the same payload twice reports everything unchanged the second time', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      const input = { values: [{ valueCode: 'TENTH_PASS', valueLabel: '10th Pass', sortOrder: 3 }] };

      repository.findValuesByCategoryId.mockResolvedValueOnce([] as never);
      const first = await service.bulkUpsertValues('EDUCATION_LEVEL', input);
      expect(first.created).toEqual(['TENTH_PASS']);

      repository.findValuesByCategoryId.mockResolvedValueOnce([
        { id: 'val-1', valueCode: 'TENTH_PASS', valueLabel: '10th Pass', sortOrder: 3, parentLookupValueId: null },
      ] as never);
      const second = await service.bulkUpsertValues('EDUCATION_LEVEL', input);
      expect(second).toEqual({ created: [], updated: [], unchanged: ['TENTH_PASS'] });
    });

    it('throws 404 for an unknown category code', async () => {
      repository.findCategoryByCode.mockResolvedValue(null);

      await expect(
        service.bulkUpsertValues('NOPE', { values: [{ valueCode: 'X', valueLabel: 'X' }] }),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.bulkUpsertValues).not.toHaveBeenCalled();
    });

    it('throws 422 when a new value\'s parentLookupValueId belongs to a different category', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValuesByCategoryId.mockResolvedValue([] as never);
      repository.findValueById.mockResolvedValue({ id: 'parent-1', lookupCategoryId: 'other-cat' } as never);

      const input = {
        values: [{ valueCode: 'SUB', valueLabel: 'Sub', parentLookupValueId: 'parent-1' }],
      };
      await expect(service.bulkUpsertValues('EDUCATION_LEVEL', input)).rejects.toMatchObject({
        status: 422,
      });
      expect(repository.bulkUpsertValues).not.toHaveBeenCalled();
    });

    it('throws 422 when an updated value\'s parentLookupValueId belongs to a different category', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValuesByCategoryId.mockResolvedValue([
        { id: 'val-1', valueCode: 'PRIMARY', valueLabel: 'Primary', sortOrder: 1, parentLookupValueId: null },
      ] as never);
      repository.findValueById.mockResolvedValue({ id: 'parent-1', lookupCategoryId: 'other-cat' } as never);

      const input = {
        values: [{ valueCode: 'PRIMARY', valueLabel: 'Primary', parentLookupValueId: 'parent-1' }],
      };
      await expect(service.bulkUpsertValues('EDUCATION_LEVEL', input)).rejects.toMatchObject({
        status: 422,
      });
      expect(repository.bulkUpsertValues).not.toHaveBeenCalled();
    });

    it('clears an existing parentLookupValueId when the payload sends null', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValuesByCategoryId.mockResolvedValue([
        { id: 'val-1', valueCode: 'SUB', valueLabel: 'Sub', sortOrder: 0, parentLookupValueId: 'parent-1' },
      ] as never);

      const input = {
        values: [{ valueCode: 'SUB', valueLabel: 'Sub', parentLookupValueId: null }],
      };
      const result = await service.bulkUpsertValues('EDUCATION_LEVEL', input);

      expect(result).toEqual({ created: [], updated: ['SUB'], unchanged: [] });
      expect(repository.bulkUpsertValues).toHaveBeenCalledWith(
        'cat-1',
        [],
        [{ id: 'val-1', data: input.values[0] }],
      );
      // No same-category check needed when clearing/omitting a parent.
      expect(repository.findValueById).not.toHaveBeenCalled();
    });

    it('treats an already-parentless value with parentLookupValueId: null as unchanged', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValuesByCategoryId.mockResolvedValue([
        { id: 'val-1', valueCode: 'GRADUATE', valueLabel: 'Graduate', sortOrder: 4, parentLookupValueId: null },
      ] as never);

      const input = {
        values: [{ valueCode: 'GRADUATE', valueLabel: 'Graduate', parentLookupValueId: null }],
      };
      const result = await service.bulkUpsertValues('EDUCATION_LEVEL', input);

      expect(result).toEqual({ created: [], updated: [], unchanged: ['GRADUATE'] });
    });

    it('throws 409 when a concurrent create wins the race on a duplicate valueCode', async () => {
      repository.findCategoryByCode.mockResolvedValue(category as never);
      repository.findValuesByCategoryId.mockResolvedValue([] as never);
      repository.bulkUpsertValues.mockRejectedValue({ code: 'P2002' });

      const input = { values: [{ valueCode: 'TENTH_PASS', valueLabel: '10th Pass' }] };

      await expect(service.bulkUpsertValues('EDUCATION_LEVEL', input)).rejects.toMatchObject({
        status: 409,
      });
    });
  });
});
