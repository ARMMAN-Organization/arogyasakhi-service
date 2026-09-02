import { LmpChangeRequestService } from './lmp-change-request.service';
import type { LmpChangeRequestRepository } from './lmp-change-request.repository';
import type { LookupClient } from '../quick-response/lookup.client';
import type { QuickResponseService } from '../quick-response/quick-response.service';
import type { CreateLmpChangeRequestInput } from './dto/create-lmpChangeRequest.dto';
import type { ApprovalRequest } from '../../../../node_modules/.prisma/client-approval-service';

function approvalRequest(overrides: Partial<ApprovalRequest> = {}): ApprovalRequest {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    requestType: 'LMP_CHANGE',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    sourceEntityType: 'BeneficiaryCase',
    sourceEntityId: '22222222-2222-2222-2222-222222222222',
    sourceSubmissionId: null,
    decisionReasonCodeLookupId: null,
    decisionNotes: null,
    decidedByUserId: null,
    sourceAnswerId: null,
    referralId: null,
    closureId: null,
    reopenRequestId: null,
    requestedByUserId: '33333333-3333-3333-3333-333333333333',
    approverUserId: null,
    requestPayloadJson: { newLmpDate: '2026-06-01T00:00:00.000Z', sonographyImageAssetId: null },
    decisionStatusLookupId: '55555555-5555-5555-5555-555555555555',
    decisionPayloadJson: null,
    decidedAt: null,
    localRequestUuid: 'device-abc-lmp-001',
    createdAt: new Date('2026-09-01'),
    createdByUserId: null,
    updatedAt: new Date('2026-09-01'),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

function lmpChangeRequestDetail(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    oldLmpDate: null,
    newLmpDate: '2026-06-01T00:00:00.000Z',
    sonographyImageAssetId: null,
    requestedByUserId: '33333333-3333-3333-3333-333333333333',
    requestedAt: '2026-09-01T00:00:00.000Z',
    supervisorStatus: 'PENDING',
    ...overrides,
  };
}

describe('LmpChangeRequestService', () => {
  const repository = {
    findByLocalRequestUuid: jest.fn(),
    create: jest.fn(),
    findByBeneficiaryId: jest.fn(),
  } as unknown as jest.Mocked<LmpChangeRequestRepository>;
  const lookupClient = {
    resolveApprovalStatusId: jest.fn(),
  } as unknown as jest.Mocked<LookupClient>;
  const quickResponseService = {
    getLmpChangeRequestDetail: jest.fn(),
  } as unknown as jest.Mocked<QuickResponseService>;

  let service: LmpChangeRequestService;
  const sakhiId = '33333333-3333-3333-3333-333333333333';
  const authHeader = 'Bearer test-token';

  const dto: CreateLmpChangeRequestInput = {
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    newLmpDate: new Date('2026-06-01'),
    localRequestUuid: 'device-abc-lmp-001',
  };

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findByLocalRequestUuid.mockResolvedValue(null);
    lookupClient.resolveApprovalStatusId.mockResolvedValue('55555555-5555-5555-5555-555555555555');
    service = new LmpChangeRequestService(repository, lookupClient, quickResponseService);
  });

  describe('create', () => {
    it('creates a new row with the correct requestPayloadJson', async () => {
      const created = approvalRequest();
      repository.create.mockResolvedValue(created);
      quickResponseService.getLmpChangeRequestDetail.mockResolvedValue(
        lmpChangeRequestDetail() as never,
      );

      const result = await service.create(dto, sakhiId, authHeader);

      expect(repository.create).toHaveBeenCalledWith({
        beneficiaryId: dto.beneficiaryId,
        requestedByUserId: sakhiId,
        decisionStatusLookupId: '55555555-5555-5555-5555-555555555555',
        requestPayloadJson: dto,
        localRequestUuid: dto.localRequestUuid,
      });
      expect(result.wasCreated).toBe(true);
      expect(result.detail).toEqual(lmpChangeRequestDetail());
    });

    it('resolves the PENDING decisionStatusLookupId before creating', async () => {
      repository.create.mockResolvedValue(approvalRequest());
      quickResponseService.getLmpChangeRequestDetail.mockResolvedValue(
        lmpChangeRequestDetail() as never,
      );

      await service.create(dto, sakhiId, authHeader);

      expect(lookupClient.resolveApprovalStatusId).toHaveBeenCalledWith('PENDING', authHeader);
    });

    describe('idempotent replay via localRequestUuid', () => {
      it('returns the same row both times when create is called twice with the same localRequestUuid', async () => {
        const created = approvalRequest();
        quickResponseService.getLmpChangeRequestDetail.mockResolvedValue(
          lmpChangeRequestDetail() as never,
        );

        repository.findByLocalRequestUuid.mockResolvedValueOnce(null);
        repository.create.mockResolvedValueOnce(created);
        const first = await service.create(dto, sakhiId, authHeader);

        repository.findByLocalRequestUuid.mockResolvedValueOnce(created);
        const second = await service.create(dto, sakhiId, authHeader);

        expect(first.wasCreated).toBe(true);
        expect(second.wasCreated).toBe(false);
        expect(first.detail).toEqual(second.detail);
        expect(repository.create).toHaveBeenCalledTimes(1);
      });

      it('does not resolve a new PENDING lookup id on an idempotent replay', async () => {
        repository.findByLocalRequestUuid.mockResolvedValue(approvalRequest());
        quickResponseService.getLmpChangeRequestDetail.mockResolvedValue(
          lmpChangeRequestDetail() as never,
        );

        await service.create(dto, sakhiId, authHeader);

        expect(lookupClient.resolveApprovalStatusId).not.toHaveBeenCalled();
        expect(repository.create).not.toHaveBeenCalled();
      });

      it('creates two distinct rows for two different localRequestUuids on the same beneficiary', async () => {
        const secondDto: CreateLmpChangeRequestInput = {
          ...dto,
          localRequestUuid: 'device-abc-lmp-002',
        };
        const firstCreated = approvalRequest({ id: '11111111-1111-1111-1111-111111111111' });
        const secondCreated = approvalRequest({
          id: '44444444-4444-4444-4444-444444444444',
          localRequestUuid: 'device-abc-lmp-002',
        });
        repository.create.mockResolvedValueOnce(firstCreated).mockResolvedValueOnce(secondCreated);
        quickResponseService.getLmpChangeRequestDetail
          .mockResolvedValueOnce(lmpChangeRequestDetail({ id: firstCreated.id }) as never)
          .mockResolvedValueOnce(lmpChangeRequestDetail({ id: secondCreated.id }) as never);

        const first = await service.create(dto, sakhiId, authHeader);
        const second = await service.create(secondDto, sakhiId, authHeader);

        expect(repository.create).toHaveBeenCalledTimes(2);
        expect(first.detail.id).toBe(firstCreated.id);
        expect(second.detail.id).toBe(secondCreated.id);
      });
    });

    describe('simulated P2002 race', () => {
      it('resolves to the winner instead of throwing when create() races on localRequestUuid', async () => {
        const winner = approvalRequest();
        repository.create.mockRejectedValue(
          Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
        );
        repository.findByLocalRequestUuid.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
        quickResponseService.getLmpChangeRequestDetail.mockResolvedValue(
          lmpChangeRequestDetail() as never,
        );

        const result = await service.create(dto, sakhiId, authHeader);

        expect(result.wasCreated).toBe(false);
        expect(result.detail).toEqual(lmpChangeRequestDetail());
      });

      it('re-throws when the P2002 race cannot be resolved to a winner', async () => {
        repository.create.mockRejectedValue(
          Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
        );
        repository.findByLocalRequestUuid.mockResolvedValueOnce(null).mockResolvedValueOnce(null);

        await expect(service.create(dto, sakhiId, authHeader)).rejects.toMatchObject({
          code: 'P2002',
        });
      });

      it('propagates a genuine (non-P2002) repository failure on create', async () => {
        repository.create.mockRejectedValue(new Error('db down'));

        await expect(service.create(dto, sakhiId, authHeader)).rejects.toThrow('db down');
      });
    });

    it('throws when no PENDING APPROVAL_STATUS lookup value is found', async () => {
      lookupClient.resolveApprovalStatusId.mockResolvedValue(null);

      await expect(service.create(dto, sakhiId, authHeader)).rejects.toThrow(
        /PENDING APPROVAL_STATUS/,
      );
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('listByBeneficiaryId', () => {
    const beneficiaryId = '22222222-2222-2222-2222-222222222222';

    it('returns the mapped detail for every row belonging to the beneficiary', async () => {
      const rowA = approvalRequest({ id: '11111111-1111-1111-1111-111111111111' });
      const rowB = approvalRequest({ id: '44444444-4444-4444-4444-444444444444' });
      repository.findByBeneficiaryId.mockResolvedValue([rowA, rowB]);
      quickResponseService.getLmpChangeRequestDetail
        .mockResolvedValueOnce(lmpChangeRequestDetail({ id: rowA.id }) as never)
        .mockResolvedValueOnce(lmpChangeRequestDetail({ id: rowB.id }) as never);

      const result = await service.listByBeneficiaryId(beneficiaryId, authHeader);

      expect(repository.findByBeneficiaryId).toHaveBeenCalledWith(beneficiaryId);
      expect(quickResponseService.getLmpChangeRequestDetail).toHaveBeenNthCalledWith(
        1,
        rowA.id,
        authHeader,
      );
      expect(quickResponseService.getLmpChangeRequestDetail).toHaveBeenNthCalledWith(
        2,
        rowB.id,
        authHeader,
      );
      expect(result).toEqual([
        lmpChangeRequestDetail({ id: rowA.id }),
        lmpChangeRequestDetail({ id: rowB.id }),
      ]);
    });

    it('returns an empty array when the beneficiary has no LMP change requests', async () => {
      repository.findByBeneficiaryId.mockResolvedValue([]);

      await expect(service.listByBeneficiaryId(beneficiaryId, authHeader)).resolves.toEqual([]);
      expect(quickResponseService.getLmpChangeRequestDetail).not.toHaveBeenCalled();
    });
  });
});
