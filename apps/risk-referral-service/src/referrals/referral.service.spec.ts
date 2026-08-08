import type { AuthenticatedUser } from '@armman/service-commons';
import { ReferralService } from './referral.service';
import type { ReferralRepository } from './referral.repository';
import type { CreateReferralInput } from './dto/create-referral.dto';
import type { DecideReferralInput } from './dto/decide-referral.dto';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';

jest.mock('./sakhi.client');

const AUTH_HEADER = 'Bearer test-token';

function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: '99999999-9999-9999-9999-999999999999',
    roles: ['ADMIN'],
    projectId: null,
    geographyUnitId: null,
    ...overrides,
  };
}

function referral(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    visitId: null,
    sourceSubmissionId: null,
    referralTypeLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    referralDate: new Date('2026-07-01'),
    triggerConditionListJson: null,
    facilityType: null,
    facilityName: null,
    status: 'PENDING_FOLLOWUP' as const,
    validTill: null,
    supervisorApprovalStatus: 'NOT_REQUIRED' as const,
    createdAt: new Date(),
    createdByUserId: null,
    updatedAt: new Date(),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

describe('ReferralService', () => {
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
  } as unknown as jest.Mocked<ReferralRepository>;
  const beneficiaryClient = {
    getById: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);
  let service: ReferralService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ReferralService(repository, beneficiaryClient);
  });

  describe('decide', () => {
    it('LAPSE: marks a PENDING_FOLLOWUP referral as LAPSED', async () => {
      const pending = referral();
      const decided = referral({ status: 'LAPSED' });
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
      repository.updateStatus.mockResolvedValue(true);

      const dto: DecideReferralInput = { decision: 'LAPSE' };
      await expect(service.decide(pending.id, dto, caller(), AUTH_HEADER)).resolves.toBe(decided);
      expect(repository.updateStatus).toHaveBeenCalledWith(
        pending.id,
        'PENDING_FOLLOWUP',
        'LAPSED',
      );
    });

    it('COMPLETE: marks a PENDING_FOLLOWUP referral as COMPLETED', async () => {
      const pending = referral();
      const decided = referral({ status: 'COMPLETED' });
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
      repository.updateStatus.mockResolvedValue(true);

      const dto: DecideReferralInput = { decision: 'COMPLETE' };
      await expect(service.decide(pending.id, dto, caller(), AUTH_HEADER)).resolves.toBe(decided);
      expect(repository.updateStatus).toHaveBeenCalledWith(
        pending.id,
        'PENDING_FOLLOWUP',
        'COMPLETED',
      );
    });

    it('REFILL: makes no status change, returns the referral as-is', async () => {
      const pending = referral();
      repository.findById.mockResolvedValue(pending);

      const dto: DecideReferralInput = { decision: 'REFILL' };
      await expect(service.decide(pending.id, dto, caller(), AUTH_HEADER)).resolves.toBe(pending);
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('404s on an unknown id', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        service.decide('unknown-id', { decision: 'LAPSE' }, caller(), AUTH_HEADER),
      ).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('409s when the referral is not PENDING_FOLLOWUP (LAPSE)', async () => {
      repository.findById.mockResolvedValue(referral({ status: 'COMPLETED' }));
      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          { decision: 'LAPSE' },
          caller(),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('409s when the referral is not PENDING_FOLLOWUP (REFILL)', async () => {
      repository.findById.mockResolvedValue(referral({ status: 'LAPSED' }));
      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          { decision: 'REFILL' },
          caller(),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('409s when the conditional update races with a concurrent decision', async () => {
      repository.findById.mockResolvedValueOnce(referral());
      repository.updateStatus.mockResolvedValue(false);
      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          { decision: 'LAPSE' },
          caller(),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('MANAGER/ADMIN callers are unscoped — no beneficiary/roster lookup made', async () => {
      const pending = referral();
      const decided = referral({ status: 'LAPSED' });
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
      repository.updateStatus.mockResolvedValue(true);

      await service.decide(
        pending.id,
        { decision: 'LAPSE' },
        caller({ roles: ['MANAGER'] }),
        AUTH_HEADER,
      );

      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    });

    it('403s when a SUPERVISOR targets a referral outside their own roster', async () => {
      repository.findById.mockResolvedValue(referral());
      beneficiaryClient.getById.mockResolvedValue({ id: 'ben-1', sakhiId: 'some-other-sakhi' });
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);

      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          { decision: 'LAPSE' },
          caller({ roles: ['SUPERVISOR'], projectId: 'project-1' }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR to decide a referral in their own roster', async () => {
      const pending = referral();
      const decided = referral({ status: 'LAPSED' });
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
      repository.updateStatus.mockResolvedValue(true);
      beneficiaryClient.getById.mockResolvedValue({ id: 'ben-1', sakhiId: 'sakhi-a' });
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);

      await expect(
        service.decide(
          pending.id,
          { decision: 'LAPSE' },
          caller({ roles: ['SUPERVISOR'], projectId: 'project-1' }),
          AUTH_HEADER,
        ),
      ).resolves.toBe(decided);
    });

    it('rejects a SUPERVISOR caller with no projectId', async () => {
      repository.findById.mockResolvedValue(referral());

      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          { decision: 'LAPSE' },
          caller({ roles: ['SUPERVISOR'], projectId: null }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
    });

    it('404s when the referral links to a beneficiary that no longer exists', async () => {
      repository.findById.mockResolvedValue(referral());
      beneficiaryClient.getById.mockResolvedValue(null);

      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          { decision: 'LAPSE' },
          caller({ roles: ['SUPERVISOR'], projectId: 'project-1' }),
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });
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
