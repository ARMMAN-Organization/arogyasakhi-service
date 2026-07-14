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
    const dto: CreateBeneficiaryInput = {
      piiId: '22222222-2222-2222-2222-222222222222',
      projectId: '11111111-1111-1111-1111-111111111111',
      caseType: 'MOTHER',
      sakhiId: '33333333-3333-3333-3333-333333333333',
      registrationDate: new Date('2026-01-01'),
      currentStatus: 'ACTIVE',
      currentPhase: 'ANC',
      beneficiaryTypeLookupId: '44444444-4444-4444-4444-444444444444',
      caseTypeLookupId: '55555555-5555-5555-5555-555555555555',
      journeyStartDate: new Date('2026-01-01'),
    };
    const created = {
      id: '1',
      piiId: dto.piiId,
      projectId: dto.projectId,
      caseType: dto.caseType,
      pregnancySequenceNo: null,
      previousBeneficiaryId: null,
      motherBeneficiaryId: null,
      sakhiId: dto.sakhiId,
      registrationDate: dto.registrationDate,
      currentStatus: dto.currentStatus,
      currentPhase: dto.currentPhase,
      beneficiaryTypeLookupId: dto.beneficiaryTypeLookupId,
      caseTypeLookupId: dto.caseTypeLookupId,
      journeyStartDate: dto.journeyStartDate,
      journeyEndDate: null,
      createdAt: new Date(),
      createdByUserId: null,
      updatedAt: new Date(),
      updatedByUserId: null,
      isDeleted: false,
      deletedAt: null,
    };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.create({
        piiId: '22222222-2222-2222-2222-222222222222',
        projectId: '11111111-1111-1111-1111-111111111111',
        caseType: 'CHILD',
        sakhiId: '33333333-3333-3333-3333-333333333333',
        registrationDate: new Date('2026-01-01'),
        currentStatus: 'ACTIVE',
        currentPhase: 'ANC',
        beneficiaryTypeLookupId: '44444444-4444-4444-4444-444444444444',
        caseTypeLookupId: '55555555-5555-5555-5555-555555555555',
        journeyStartDate: new Date('2026-01-01'),
      }),
    ).rejects.toThrow('db down');
  });
});
