import { ApprovalRequestService } from './approvalRequest.service';
import type { ApprovalRequestRepository } from './approvalRequest.repository';
import type { CreateApprovalRequestInput } from './dto/create-approvalRequest.dto';
import type { ApprovalRequest } from '../../../../node_modules/.prisma/client-approval-service';

describe('ApprovalRequestService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<ApprovalRequestRepository>;
  let service: ApprovalRequestService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ApprovalRequestService(repository);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns the repository list unchanged', async () => {
    const rows: ApprovalRequest[] = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        requestType: 'LMP_CHANGE',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        sourceEntityType: 'BeneficiaryCase',
        sourceEntityId: '33333333-3333-3333-3333-333333333333',
        sourceSubmissionId: null,
        decisionReasonCodeLookupId: null,
        decisionNotes: null,
        decidedByUserId: null,
        sourceAnswerId: null,
        referralId: null,
        closureId: null,
        reopenRequestId: null,
        requestedByUserId: '44444444-4444-4444-4444-444444444444',
        approverUserId: null,
        requestPayloadJson: null,
        decisionStatusLookupId: '55555555-5555-5555-5555-555555555555',
        decisionPayloadJson: null,
        decidedAt: null,
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
    const dto: CreateApprovalRequestInput = {
      requestType: 'LMP_CHANGE',
      sourceEntityType: 'BeneficiaryCase',
      sourceEntityId: '33333333-3333-3333-3333-333333333333',
      requestedByUserId: '44444444-4444-4444-4444-444444444444',
      decisionStatusLookupId: '55555555-5555-5555-5555-555555555555',
    };
    const created: ApprovalRequest = {
      id: '11111111-1111-1111-1111-111111111111',
      requestType: 'LMP_CHANGE',
      beneficiaryId: null,
      sourceEntityType: 'BeneficiaryCase',
      sourceEntityId: '33333333-3333-3333-3333-333333333333',
      sourceSubmissionId: null,
      decisionReasonCodeLookupId: null,
      decisionNotes: null,
      decidedByUserId: null,
      sourceAnswerId: null,
      referralId: null,
      closureId: null,
      reopenRequestId: null,
      requestedByUserId: '44444444-4444-4444-4444-444444444444',
      approverUserId: null,
      requestPayloadJson: null,
      decisionStatusLookupId: '55555555-5555-5555-5555-555555555555',
      decisionPayloadJson: null,
      decidedAt: null,
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
        requestType: 'LMP_CHANGE',
        sourceEntityType: 'BeneficiaryCase',
        sourceEntityId: '33333333-3333-3333-3333-333333333333',
        requestedByUserId: '44444444-4444-4444-4444-444444444444',
        decisionStatusLookupId: '55555555-5555-5555-5555-555555555555',
      }),
    ).rejects.toThrow('db down');
  });
});
