import { ReferralService } from './referral.service';
import type { ReferralRepository } from './referral.repository';
import type { CreateReferralInput } from './dto/create-referral.dto';

describe('ReferralService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<ReferralRepository>;
  let service: ReferralService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ReferralService(repository);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns the repository list unchanged', async () => {
    const listDto: CreateReferralInput = {
      beneficiaryId: '22222222-2222-2222-2222-222222222222',
      referralTypeLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      referralDate: new Date('2026-07-01'),
      facilityType: 'PHC',
      facilityName: 'Community PHC',
      status: 'INITIATED',
      supervisorApprovalStatus: 'NOT_REQUIRED',
    };
    const rows = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        beneficiaryId: listDto.beneficiaryId,
        visitId: null,
        sourceSubmissionId: null,
        referralTypeLookupValueId: listDto.referralTypeLookupValueId,
        referralDate: listDto.referralDate,
        triggerConditionListJson: null,
        facilityType: listDto.facilityType ?? null,
        facilityName: listDto.facilityName ?? null,
        status: listDto.status,
        validTill: null,
        supervisorApprovalStatus: listDto.supervisorApprovalStatus,
        createdAt: new Date(),
        createdByUserId: null,
        updatedAt: new Date(),
        updatedByUserId: null,
        isDeleted: false,
        deletedAt: null,
      },
    ];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('creates via repository with the given data', async () => {
    const dto: CreateReferralInput = {
      beneficiaryId: '22222222-2222-2222-2222-222222222222',
      referralTypeLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      referralDate: new Date('2026-07-01'),
      status: 'INITIATED',
      supervisorApprovalStatus: 'NOT_REQUIRED',
    };
    const created = {
      id: '11111111-1111-1111-1111-111111111111',
      beneficiaryId: dto.beneficiaryId,
      visitId: null,
      sourceSubmissionId: null,
      referralTypeLookupValueId: dto.referralTypeLookupValueId,
      referralDate: dto.referralDate,
      triggerConditionListJson: null,
      facilityType: null,
      facilityName: null,
      status: dto.status,
      validTill: null,
      supervisorApprovalStatus: dto.supervisorApprovalStatus,
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
    const dto: CreateReferralInput = {
      beneficiaryId: '22222222-2222-2222-2222-222222222222',
      referralTypeLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      referralDate: new Date('2026-07-01'),
      status: 'INITIATED',
      supervisorApprovalStatus: 'NOT_REQUIRED',
    };
    await expect(service.create(dto)).rejects.toThrow('db down');
  });
});
