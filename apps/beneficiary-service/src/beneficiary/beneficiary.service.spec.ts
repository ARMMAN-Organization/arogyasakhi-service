import { BeneficiaryService } from './beneficiary.service';
import type { BeneficiaryRepository } from './beneficiary.repository';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';

describe('BeneficiaryService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryRepository>;
  let service: BeneficiaryService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new BeneficiaryService(repository);
  });

  it('lists beneficiaries via the repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  it('creates via repository with the given data', async () => {
    const dto: CreateBeneficiaryInput = { caseType: 'MOTHER', name: 'Jane', projectId: '11111111-1111-1111-1111-111111111111' };
    const created = {
      id: '1',
      caseType: 'MOTHER',
      name: 'Jane',
      projectId: '11111111-1111-1111-1111-111111111111',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.create({ caseType: 'CHILD', name: 'x', projectId: '11111111-1111-1111-1111-111111111111' }),
    ).rejects.toThrow('db down');
  });
});
