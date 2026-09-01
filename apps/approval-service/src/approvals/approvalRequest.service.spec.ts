import { ApprovalRequestService } from './approvalRequest.service';
import type { ApprovalRequestRepository } from './approvalRequest.repository';
import type { CreateApprovalRequestInput } from './dto/create-approvalRequest.dto';
import type { SakhiClient, SakhiRecord } from '../quick-response/sakhi.client';
import type {
  BeneficiaryClient,
  BeneficiaryCaseDetail,
} from '../quick-response/beneficiary.client';
import type { NotificationClient } from '../quick-response/notification.client';
import type { ApprovalRequest } from '../../../../node_modules/.prisma/client-approval-service';

/**
 * notifySupervisor is fired-and-forgotten by create() (see its own doc
 * comment) — its internal await chain (Sakhi lookup -> beneficiary lookup ->
 * notify) hasn't necessarily finished by the time create()'s own promise
 * resolves. A macrotask tick lets every already-scheduled microtask in that
 * chain drain before assertions run.
 */
function flushPromises(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('ApprovalRequestService', () => {
  const authorizationHeader = 'Bearer test-token';

  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
    findByClosureId: jest.fn(),
    findByReopenRequestId: jest.fn(),
  } as unknown as jest.Mocked<ApprovalRequestRepository>;
  const sakhiClient = {
    getById: jest.fn(),
  } as unknown as jest.Mocked<SakhiClient>;
  const beneficiaryClient = {
    getById: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  const notificationClient = {
    notify: jest.fn(),
  } as unknown as jest.Mocked<NotificationClient>;

  let service: ApprovalRequestService;
  let consoleErrorSpy: jest.SpyInstance;

  const baseDto: CreateApprovalRequestInput = {
    requestType: 'LMP_CHANGE',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    sourceEntityType: 'BeneficiaryCase',
    sourceEntityId: '33333333-3333-3333-3333-333333333333',
    requestedByUserId: '44444444-4444-4444-4444-444444444444',
    decisionStatusLookupId: '55555555-5555-5555-5555-555555555555',
  };

  const created: ApprovalRequest = {
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
  };

  const sakhiRecord: SakhiRecord = {
    sakhiId: '44444444-4444-4444-4444-444444444444',
    displayName: 'Asha Devi',
    mobileNumber: '9999999999',
    supervisorId: '66666666-6666-6666-6666-666666666666',
  };

  const beneficiaryRecord = {
    id: '22222222-2222-2222-2222-222222222222',
    sakhiId: '44444444-4444-4444-4444-444444444444',
    pii: { fullName: 'Sita Kumari', padaId: null },
    motherCaseDetails: null,
    riskConditionSummaries: [],
  } as unknown as BeneficiaryCaseDetail;

  beforeEach(() => {
    jest.resetAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    service = new ApprovalRequestService(
      repository,
      sakhiClient,
      beneficiaryClient,
      notificationClient,
    );
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns the repository list unchanged', async () => {
    const rows: ApprovalRequest[] = [created];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('creates via repository with the given data and resolves with the created row', async () => {
    repository.create.mockResolvedValue(created);
    sakhiClient.getById.mockResolvedValue(sakhiRecord);
    beneficiaryClient.getById.mockResolvedValue(beneficiaryRecord);

    await expect(service.create(baseDto, authorizationHeader)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(baseDto);
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(service.create(baseDto, authorizationHeader)).rejects.toThrow('db down');
    expect(notificationClient.notify).not.toHaveBeenCalled();
  });

  it('notifies the assigned Supervisor with the Sakhi and beneficiary names, linked to the card', async () => {
    repository.create.mockResolvedValue(created);
    sakhiClient.getById.mockResolvedValue(sakhiRecord);
    beneficiaryClient.getById.mockResolvedValue(beneficiaryRecord);

    await service.create(baseDto, authorizationHeader);
    await flushPromises();

    expect(notificationClient.notify).toHaveBeenCalledTimes(1);
    expect(notificationClient.notify).toHaveBeenCalledWith(
      sakhiRecord.supervisorId,
      'SUPERVISOR_APPROVAL_REQUESTED',
      expect.stringContaining('LMP change request'),
      expect.stringContaining('Sita Kumari'),
      authorizationHeader,
      { linkedEntityType: 'QuickResponseCard', linkedEntityId: created.id },
    );
    expect(notificationClient.notify.mock.calls[0][3]).toContain('Asha Devi');
  });

  it('omits the beneficiary name when beneficiaryId is absent (e.g. TRANSFER)', async () => {
    const transferDto: CreateApprovalRequestInput = {
      ...baseDto,
      requestType: 'TRANSFER',
      beneficiaryId: undefined,
    };
    repository.create.mockResolvedValue({
      ...created,
      requestType: 'TRANSFER',
      beneficiaryId: null,
    });
    sakhiClient.getById.mockResolvedValue(sakhiRecord);

    await service.create(transferDto, authorizationHeader);
    await flushPromises();

    expect(beneficiaryClient.getById).not.toHaveBeenCalled();
    expect(notificationClient.notify).toHaveBeenCalledTimes(1);
    expect(notificationClient.notify.mock.calls[0][3]).not.toContain('null');
  });

  it.each([
    'LMP_CHANGE',
    'REFERRAL_INCOMPLETE',
    'ACCOMPANIED_REFERRAL',
    'CLOSURE_REVIEW',
    'REOPEN',
    'DATA_RESTORE',
    'TRANSFER',
  ] as const)('fires the notification for requestType %s', async (requestType) => {
    const dto: CreateApprovalRequestInput = { ...baseDto, requestType };
    repository.create.mockResolvedValue({ ...created, requestType });
    sakhiClient.getById.mockResolvedValue(sakhiRecord);
    beneficiaryClient.getById.mockResolvedValue(beneficiaryRecord);

    await service.create(dto, authorizationHeader);
    await flushPromises();

    expect(notificationClient.notify).toHaveBeenCalledTimes(1);
  });

  it('skips notifying when the Sakhi has no assigned Supervisor', async () => {
    repository.create.mockResolvedValue(created);
    sakhiClient.getById.mockResolvedValue({ ...sakhiRecord, supervisorId: null });

    await expect(service.create(baseDto, authorizationHeader)).resolves.toBe(created);
    await flushPromises();
    expect(notificationClient.notify).not.toHaveBeenCalled();
  });

  it('skips notifying when the Sakhi lookup returns null', async () => {
    repository.create.mockResolvedValue(created);
    sakhiClient.getById.mockResolvedValue(null);

    await expect(service.create(baseDto, authorizationHeader)).resolves.toBe(created);
    await flushPromises();
    expect(notificationClient.notify).not.toHaveBeenCalled();
  });

  it('skips notifying when the resolved Supervisor id equals the requester (self-supervision guard)', async () => {
    repository.create.mockResolvedValue(created);
    sakhiClient.getById.mockResolvedValue({
      ...sakhiRecord,
      supervisorId: baseDto.requestedByUserId,
    });

    await expect(service.create(baseDto, authorizationHeader)).resolves.toBe(created);
    await flushPromises();
    expect(notificationClient.notify).not.toHaveBeenCalled();
  });

  it('still resolves with the created row when the Sakhi lookup throws', async () => {
    repository.create.mockResolvedValue(created);
    sakhiClient.getById.mockRejectedValue(new Error('auth-service unreachable'));

    await expect(service.create(baseDto, authorizationHeader)).resolves.toBe(created);
    await flushPromises();
    expect(notificationClient.notify).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('still notifies (without a beneficiary name) when the beneficiary lookup throws', async () => {
    repository.create.mockResolvedValue(created);
    sakhiClient.getById.mockResolvedValue(sakhiRecord);
    beneficiaryClient.getById.mockRejectedValue(new Error('beneficiary-service unreachable'));

    await expect(service.create(baseDto, authorizationHeader)).resolves.toBe(created);
    await flushPromises();
    expect(notificationClient.notify).toHaveBeenCalledTimes(1);
    expect(notificationClient.notify.mock.calls[0][3]).not.toContain('Sita Kumari');
  });

  it('still resolves with the created row when the notification client throws', async () => {
    repository.create.mockResolvedValue(created);
    sakhiClient.getById.mockResolvedValue(sakhiRecord);
    beneficiaryClient.getById.mockResolvedValue(beneficiaryRecord);
    notificationClient.notify.mockRejectedValue(new Error('notification-escalation-service down'));

    await expect(service.create(baseDto, authorizationHeader)).resolves.toBe(created);
    await flushPromises();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  describe('findByClosureId', () => {
    it('resolves with the matching approval request', async () => {
      const closureCard = {
        ...created,
        requestType: 'CLOSURE_REVIEW' as const,
        closureId: created.id,
      };
      repository.findByClosureId.mockResolvedValue(closureCard);

      await expect(service.findByClosureId(created.id)).resolves.toBe(closureCard);
      expect(repository.findByClosureId).toHaveBeenCalledWith(created.id);
    });

    it('404s when no approval request is found for the closure', async () => {
      repository.findByClosureId.mockResolvedValue(null);

      await expect(service.findByClosureId(created.id)).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('findByReopenRequestId', () => {
    it('resolves with the matching approval request', async () => {
      const reopenCard = {
        ...created,
        requestType: 'REOPEN' as const,
        reopenRequestId: created.id,
      };
      repository.findByReopenRequestId.mockResolvedValue(reopenCard);

      await expect(service.findByReopenRequestId(created.id)).resolves.toBe(reopenCard);
      expect(repository.findByReopenRequestId).toHaveBeenCalledWith(created.id);
    });

    it('404s when no approval request is found for the reopen request', async () => {
      repository.findByReopenRequestId.mockResolvedValue(null);

      await expect(service.findByReopenRequestId(created.id)).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});
