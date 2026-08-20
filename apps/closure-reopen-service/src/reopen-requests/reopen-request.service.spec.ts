import { ReopenRequestService } from './reopen-request.service';
import type { ReopenRequestRepository } from './reopen-request.repository';
import type { AuditClient } from './audit.client';
import type { NotificationClient } from './notification.client';
import type { ApprovalClient } from './approval.client';
import type { LookupClient } from './lookup.client';
import type { BeneficiaryClient } from './beneficiary.client';
import type { CreateReopenRequestInput } from './dto/create-reopen-request.dto';
import type { DecideReopenRequestInput } from './dto/decide-reopen-request.dto';

function reopenRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    localReopenRequestUuid: 'device-abc-reopen-001',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    requestReason: 'CLOSED_BY_MISTAKE' as const,
    requestedByUserId: '33333333-3333-3333-3333-333333333333',
    requestedAt: new Date('2026-08-01'),
    supervisorStatus: 'PENDING' as const,
    decisionReasonCodeLookupId: null,
    decisionNotes: null,
    decidedByUserId: null,
    decidedAt: null,
    createdAt: new Date('2026-08-01'),
    createdByUserId: null,
    updatedAt: new Date('2026-08-01'),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

describe('ReopenRequestService', () => {
  const repository = {
    findById: jest.fn(),
    findByBeneficiaryId: jest.fn(),
    findByLocalReopenRequestUuid: jest.fn(),
    findManyByIds: jest.fn(),
    decide: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<ReopenRequestRepository>;
  const auditClient = { log: jest.fn() } as unknown as jest.Mocked<AuditClient>;
  const notificationClient = { notify: jest.fn() } as unknown as jest.Mocked<NotificationClient>;
  const approvalClient = { create: jest.fn() } as unknown as jest.Mocked<ApprovalClient>;
  const lookupClient = {
    resolveApprovalStatusId: jest.fn(),
  } as unknown as jest.Mocked<LookupClient>;
  const beneficiaryClient = {
    reactivateCase: jest.fn(),
    getById: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  let service: ReopenRequestService;
  const supervisorId = '44444444-4444-4444-4444-444444444444';
  const authHeader = 'Bearer token';
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    repository.findByLocalReopenRequestUuid.mockResolvedValue(null);
    beneficiaryClient.reactivateCase.mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      currentStatus: 'ACTIVE',
    });
    service = new ReopenRequestService(
      repository,
      auditClient,
      notificationClient,
      approvalClient,
      lookupClient,
      beneficiaryClient,
    );
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('listByBeneficiaryId', () => {
    const beneficiaryId = '22222222-2222-2222-2222-222222222222';

    it('returns the reopen requests when the beneficiary lookup succeeds', async () => {
      beneficiaryClient.getById.mockResolvedValue({ id: beneficiaryId, currentStatus: 'CLOSED' });
      const rows = [reopenRequest()];
      repository.findByBeneficiaryId.mockResolvedValue(rows);

      await expect(service.listByBeneficiaryId(beneficiaryId, authHeader)).resolves.toBe(rows);
      expect(repository.findByBeneficiaryId).toHaveBeenCalledWith(beneficiaryId);
    });

    it('returns an empty array when the beneficiary has no reopen requests', async () => {
      beneficiaryClient.getById.mockResolvedValue({ id: beneficiaryId, currentStatus: 'CLOSED' });
      repository.findByBeneficiaryId.mockResolvedValue([]);

      await expect(service.listByBeneficiaryId(beneficiaryId, authHeader)).resolves.toEqual([]);
    });

    it('propagates a 403 from the beneficiary lookup without querying reopen requests', async () => {
      beneficiaryClient.getById.mockRejectedValue(
        Object.assign(new Error('This beneficiary case is outside your own roster.'), {
          status: 403,
        }),
      );

      await expect(service.listByBeneficiaryId(beneficiaryId, authHeader)).rejects.toMatchObject({
        status: 403,
      });
      expect(repository.findByBeneficiaryId).not.toHaveBeenCalled();
    });

    it('propagates a 404 from the beneficiary lookup without querying reopen requests', async () => {
      beneficiaryClient.getById.mockRejectedValue(
        Object.assign(new Error('Beneficiary case not found.'), { status: 404 }),
      );

      await expect(service.listByBeneficiaryId(beneficiaryId, authHeader)).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.findByBeneficiaryId).not.toHaveBeenCalled();
    });

    it('propagates a badGateway error when the beneficiary lookup is unreachable', async () => {
      beneficiaryClient.getById.mockRejectedValue(
        Object.assign(new Error('Unable to resolve the beneficiary — unreachable.'), {
          status: 502,
        }),
      );

      await expect(service.listByBeneficiaryId(beneficiaryId, authHeader)).rejects.toMatchObject({
        status: 502,
      });
      expect(repository.findByBeneficiaryId).not.toHaveBeenCalled();
    });
  });

  describe('getDecisionStatusByIds', () => {
    it('delegates to the repository with the given ids', async () => {
      const rows = [
        { id: '11111111-1111-1111-1111-111111111111', supervisorStatus: 'PENDING' as const },
      ];
      repository.findManyByIds.mockResolvedValue(rows);

      const ids = ['11111111-1111-1111-1111-111111111111'];
      await expect(service.getDecisionStatusByIds(ids)).resolves.toBe(rows);
      expect(repository.findManyByIds).toHaveBeenCalledWith(ids);
    });
  });

  describe('getById', () => {
    it('returns the reopen request via repository', async () => {
      const row = reopenRequest();
      repository.findById.mockResolvedValue(row);

      await expect(service.getById(row.id)).resolves.toBe(row);
      expect(repository.findById).toHaveBeenCalledWith(row.id);
    });

    it('404s on an unknown id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById('unknown-id')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('create', () => {
    const sakhiId = '55555555-5555-5555-5555-555555555555';
    const dto: CreateReopenRequestInput = {
      localReopenRequestUuid: 'device-abc-reopen-001',
      beneficiaryId: '22222222-2222-2222-2222-222222222222',
      requestReason: 'CLOSED_BY_MISTAKE',
    };

    describe('idempotent replay via localReopenRequestUuid', () => {
      it('returns the existing reopen request without creating a new row on a retried submission', async () => {
        const existing = reopenRequest();
        repository.findByLocalReopenRequestUuid.mockResolvedValue(existing);

        await expect(service.create(dto, sakhiId, authHeader)).resolves.toBe(existing);
        expect(repository.create).not.toHaveBeenCalled();
      });

      it('does not re-raise a Quick Response card on a retried submission', async () => {
        const existing = reopenRequest();
        repository.findByLocalReopenRequestUuid.mockResolvedValue(existing);

        await service.create(dto, sakhiId, authHeader);

        expect(approvalClient.create).not.toHaveBeenCalled();
      });

      it("looks up by this submission's own localReopenRequestUuid", async () => {
        repository.create.mockResolvedValue(reopenRequest());
        lookupClient.resolveApprovalStatusId.mockResolvedValue('pending-lookup-id');

        await service.create(dto, sakhiId, authHeader);

        expect(repository.findByLocalReopenRequestUuid).toHaveBeenCalledWith(
          dto.localReopenRequestUuid,
        );
      });
    });

    it('creates via repository with requestedByUserId stamped from the caller', async () => {
      const created = reopenRequest({ requestedByUserId: sakhiId });
      repository.create.mockResolvedValue(created);
      lookupClient.resolveApprovalStatusId.mockResolvedValue('pending-lookup-id');

      await expect(service.create(dto, sakhiId, authHeader)).resolves.toBe(created);
      expect(repository.create).toHaveBeenCalledWith({ ...dto, requestedByUserId: sakhiId });
    });

    it('raises a REOPEN Quick Response card via approvalClient after creating', async () => {
      const created = reopenRequest({ requestedByUserId: sakhiId });
      repository.create.mockResolvedValue(created);
      lookupClient.resolveApprovalStatusId.mockResolvedValue('pending-lookup-id');

      await service.create(dto, sakhiId, authHeader);

      expect(lookupClient.resolveApprovalStatusId).toHaveBeenCalledWith('PENDING', authHeader);
      expect(approvalClient.create).toHaveBeenCalledWith(
        {
          requestType: 'REOPEN',
          beneficiaryId: created.beneficiaryId,
          sourceEntityType: 'ReopenRequest',
          sourceEntityId: created.id,
          reopenRequestId: created.id,
          requestedByUserId: sakhiId,
          decisionStatusLookupId: 'pending-lookup-id',
        },
        authHeader,
      );
    });

    it('still returns the created reopen request when raising the card fails', async () => {
      const created = reopenRequest({ requestedByUserId: sakhiId });
      repository.create.mockResolvedValue(created);
      lookupClient.resolveApprovalStatusId.mockResolvedValue('pending-lookup-id');
      approvalClient.create.mockRejectedValue(
        Object.assign(new Error('Bad gateway'), { status: 502 }),
      );

      await expect(service.create(dto, sakhiId, authHeader)).resolves.toBe(created);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('still returns the created reopen request when no PENDING lookup value is found', async () => {
      const created = reopenRequest({ requestedByUserId: sakhiId });
      repository.create.mockResolvedValue(created);
      lookupClient.resolveApprovalStatusId.mockResolvedValue(null);

      await expect(service.create(dto, sakhiId, authHeader)).resolves.toBe(created);
      expect(approvalClient.create).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('propagates a genuine repository failure on create', async () => {
      repository.create.mockRejectedValue(new Error('db down'));
      await expect(service.create(dto, sakhiId, authHeader)).rejects.toThrow('db down');
      expect(approvalClient.create).not.toHaveBeenCalled();
    });
  });

  it('approves a PENDING reopen request, reactivates the beneficiary, audits, and notifies the Sakhi', async () => {
    const pending = reopenRequest();
    const decided = reopenRequest({ supervisorStatus: 'APPROVED', decidedByUserId: supervisorId });
    repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
    repository.decide.mockResolvedValue(true);

    const dto: DecideReopenRequestInput = { decision: 'APPROVED' };
    await expect(service.decide(pending.id, supervisorId, dto, authHeader)).resolves.toBe(decided);
    expect(repository.decide).toHaveBeenCalledWith(pending.id, supervisorId, dto);
    expect(beneficiaryClient.reactivateCase).toHaveBeenCalledWith(
      pending.beneficiaryId,
      authHeader,
    );
    expect(auditClient.log).toHaveBeenCalledWith(
      supervisorId,
      'QUICK_RESPONSE_APPROVE',
      'ReopenRequest',
      pending.id,
      { decision: 'APPROVED', decisionNotes: null },
      authHeader,
    );
    expect(notificationClient.notify).toHaveBeenCalledWith(
      pending.requestedByUserId,
      'REOPEN_UPDATE',
      expect.any(String),
      expect.any(String),
      authHeader,
    );
  });

  it('rejects a PENDING reopen request — persisted as the "Cannot re-open" state, no reactivation', async () => {
    const pending = reopenRequest();
    const decided = reopenRequest({ supervisorStatus: 'REJECTED', decidedByUserId: supervisorId });
    repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
    repository.decide.mockResolvedValue(true);

    const dto: DecideReopenRequestInput = { decision: 'REJECTED' };
    const result = await service.decide(pending.id, supervisorId, dto, authHeader);
    expect(result?.supervisorStatus).toBe('REJECTED');
    expect(beneficiaryClient.reactivateCase).not.toHaveBeenCalled();
    expect(auditClient.log).toHaveBeenCalledWith(
      supervisorId,
      'QUICK_RESPONSE_REJECT',
      'ReopenRequest',
      pending.id,
      { decision: 'REJECTED', decisionNotes: null },
      authHeader,
    );
  });

  it('404s on an unknown id', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(
      service.decide('unknown-id', supervisorId, { decision: 'APPROVED' }, authHeader),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.decide).not.toHaveBeenCalled();
  });

  it('409s on an already-APPROVED reopen request', async () => {
    repository.findById.mockResolvedValue(reopenRequest({ supervisorStatus: 'APPROVED' }));
    await expect(
      service.decide(
        '11111111-1111-1111-1111-111111111111',
        supervisorId,
        {
          decision: 'REJECTED',
        },
        authHeader,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(repository.decide).not.toHaveBeenCalled();
  });

  it('409s on an already-REJECTED reopen request', async () => {
    repository.findById.mockResolvedValue(reopenRequest({ supervisorStatus: 'REJECTED' }));
    await expect(
      service.decide(
        '11111111-1111-1111-1111-111111111111',
        supervisorId,
        {
          decision: 'APPROVED',
        },
        authHeader,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('409s when the conditional update races with a concurrent decision', async () => {
    repository.findById.mockResolvedValueOnce(reopenRequest());
    repository.decide.mockResolvedValue(false);
    await expect(
      service.decide(
        '11111111-1111-1111-1111-111111111111',
        supervisorId,
        {
          decision: 'APPROVED',
        },
        authHeader,
      ),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('succeeds with no decisionReasonCodeLookupId/decisionNotes (both optional)', async () => {
    const pending = reopenRequest();
    const decided = reopenRequest({ supervisorStatus: 'APPROVED' });
    repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
    repository.decide.mockResolvedValue(true);

    await expect(
      service.decide(pending.id, supervisorId, { decision: 'APPROVED' }, authHeader),
    ).resolves.toBe(decided);
  });

  it('does not fail the request when notifying the Sakhi throws after the decision is committed', async () => {
    const pending = reopenRequest();
    const decided = reopenRequest({ supervisorStatus: 'APPROVED', decidedByUserId: supervisorId });
    repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
    repository.decide.mockResolvedValue(true);
    notificationClient.notify.mockRejectedValue(
      Object.assign(new Error('Forbidden'), { status: 403 }),
    );

    await expect(
      service.decide(pending.id, supervisorId, { decision: 'APPROVED' }, authHeader),
    ).resolves.toBe(decided);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('does not fail the request when writing the audit entry throws after the decision is committed', async () => {
    const pending = reopenRequest();
    const decided = reopenRequest({ supervisorStatus: 'APPROVED', decidedByUserId: supervisorId });
    repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
    repository.decide.mockResolvedValue(true);
    auditClient.log.mockRejectedValue(Object.assign(new Error('Bad gateway'), { status: 502 }));

    await expect(
      service.decide(pending.id, supervisorId, { decision: 'APPROVED' }, authHeader),
    ).resolves.toBe(decided);
    expect(notificationClient.notify).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('does not fail the request when beneficiary reactivation fails after the decision is already committed', async () => {
    const pending = reopenRequest();
    const decided = reopenRequest({ supervisorStatus: 'APPROVED', decidedByUserId: supervisorId });
    repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
    repository.decide.mockResolvedValue(true);
    beneficiaryClient.reactivateCase.mockRejectedValue(
      Object.assign(new Error('Cannot reactivate a case with status ACTIVE.'), { status: 409 }),
    );

    // supervisorStatus is already committed to APPROVED by repository.decide,
    // and decide()'s own PENDING-only guard means this request could never be
    // re-decided to retry just the reactivation — so a failure here must not
    // fail the whole request, same tolerance as the audit/notification calls.
    await expect(
      service.decide(pending.id, supervisorId, { decision: 'APPROVED' }, authHeader),
    ).resolves.toBe(decided);
    expect(repository.decide).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
    // The audit/notification calls still run — a downstream reactivation
    // failure isn't a reason to also skip the audit trail or Sakhi notice.
    expect(auditClient.log).toHaveBeenCalled();
    expect(notificationClient.notify).toHaveBeenCalled();
  });
});
