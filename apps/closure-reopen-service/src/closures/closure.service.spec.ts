import { ClosureService } from './closure.service';
import type { ClosureRepository } from './closure.repository';
import type { ApprovalClient } from '../reopen-requests/approval.client';
import type { LookupClient } from '../reopen-requests/lookup.client';
import type { NotificationClient } from '../reopen-requests/notification.client';
import type { BeneficiaryClient } from '../reopen-requests/beneficiary.client';
import type { CreateClosureInput } from './dto/create-closure.dto';
import type { DecideClosureInput } from './dto/decide-closure.dto';
import type { ClosureType } from '../../../../node_modules/.prisma/client-closure-reopen-service';

function closureRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    localClosureUuid: 'device-abc-closure-001',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    closureType: 'MEDICAL' as ClosureType,
    closureReasonLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    eventDate: null,
    closureDate: new Date('2026-06-05'),
    submittedByUserId: '33333333-3333-3333-3333-333333333333',
    supervisorStatus: null,
    supervisorId: null,
    supervisorNotes: null,
    createdAt: new Date(),
    createdByUserId: null,
    updatedAt: new Date(),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

describe('ClosureService', () => {
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
    findByLocalClosureUuid: jest.fn(),
    findManyByIds: jest.fn(),
    create: jest.fn(),
    decide: jest.fn(),
  } as unknown as jest.Mocked<ClosureRepository>;
  const approvalClient = { create: jest.fn() } as unknown as jest.Mocked<ApprovalClient>;
  const lookupClient = {
    resolveApprovalStatusId: jest.fn(),
    resolveClosureReasonCode: jest.fn(),
  } as unknown as jest.Mocked<LookupClient>;
  const notificationClient = { notify: jest.fn() } as unknown as jest.Mocked<NotificationClient>;
  const beneficiaryClient = {
    closeCase: jest.fn(),
    getById: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  let service: ClosureService;
  const authHeader = 'Bearer token';
  const supervisorId = '44444444-4444-4444-4444-444444444444';
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    repository.findByLocalClosureUuid.mockResolvedValue(null);
    beneficiaryClient.closeCase.mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      currentStatus: 'CLOSED',
    });
    beneficiaryClient.getById.mockResolvedValue({
      id: '22222222-2222-2222-2222-222222222222',
      currentStatus: 'ACTIVE',
    });
    lookupClient.resolveClosureReasonCode.mockResolvedValue('WITHDRAWAL');
    service = new ClosureService(
      repository,
      approvalClient,
      lookupClient,
      notificationClient,
      beneficiaryClient,
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
    const rows = [closureRow()];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
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
    it('returns the closure via repository', async () => {
      const closure = closureRow();
      repository.findById.mockResolvedValue(closure);

      await expect(service.getById(closure.id)).resolves.toBe(closure);
      expect(repository.findById).toHaveBeenCalledWith(closure.id);
    });

    it('404s on an unknown id', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(service.getById('unknown-id')).rejects.toMatchObject({ status: 404 });
    });
  });

  describe('create', () => {
    const dto: CreateClosureInput = {
      localClosureUuid: 'device-abc-closure-001',
      beneficiaryId: '22222222-2222-2222-2222-222222222222',
      closureType: 'MEDICAL',
      closureReasonLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      closureDate: new Date('2026-06-05'),
      submittedByUserId: '33333333-3333-3333-3333-333333333333',
    };

    it('creates via repository with the given data and server-derived supervisorStatus', async () => {
      const created = closureRow();
      repository.create.mockResolvedValue(created);

      await expect(service.create(dto, authHeader)).resolves.toBe(created);
      expect(repository.create).toHaveBeenCalledWith(dto, null);
      expect(approvalClient.create).not.toHaveBeenCalled();
    });

    it('checks ownership via beneficiaryClient.getById before creating', async () => {
      repository.create.mockResolvedValue(closureRow());
      await service.create(dto, authHeader);
      expect(beneficiaryClient.getById).toHaveBeenCalledWith(dto.beneficiaryId, authHeader);
    });

    it('propagates a 403 from the ownership check without creating a closure', async () => {
      beneficiaryClient.getById.mockRejectedValue(
        Object.assign(new Error('This beneficiary case is outside your own roster.'), {
          status: 403,
        }),
      );
      await expect(service.create(dto, authHeader)).rejects.toMatchObject({ status: 403 });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('derives supervisorStatus: PENDING only when the resolved reason is MIGRATION — never from client input', async () => {
      lookupClient.resolveClosureReasonCode.mockResolvedValue('MIGRATION');
      repository.create.mockResolvedValue(closureRow({ supervisorStatus: 'PENDING' }));

      await service.create(dto, authHeader);

      expect(repository.create).toHaveBeenCalledWith(dto, 'PENDING');
    });

    it('derives supervisorStatus: null for a non-review reason', async () => {
      lookupClient.resolveClosureReasonCode.mockResolvedValue('WITHDRAWAL');
      repository.create.mockResolvedValue(closureRow({ supervisorStatus: null }));

      await service.create(dto, authHeader);

      expect(repository.create).toHaveBeenCalledWith(dto, null);
    });

    it('propagates repository errors on create', async () => {
      repository.create.mockRejectedValue(new Error('db down'));
      await expect(service.create(dto, authHeader)).rejects.toThrow('db down');
    });

    describe('idempotent replay via localClosureUuid', () => {
      it('returns the existing closure without creating a new row on a retried submission', async () => {
        const existing = closureRow();
        repository.findByLocalClosureUuid.mockResolvedValue(existing);

        await expect(service.create(dto, authHeader)).resolves.toBe(existing);
        expect(repository.create).not.toHaveBeenCalled();
      });

      it('does not re-raise a Quick Response card or re-close the beneficiary on a retried submission', async () => {
        const existing = closureRow({ supervisorStatus: 'PENDING' });
        repository.findByLocalClosureUuid.mockResolvedValue(existing);

        await service.create(dto, authHeader);

        expect(approvalClient.create).not.toHaveBeenCalled();
        expect(beneficiaryClient.closeCase).not.toHaveBeenCalled();
      });

      it("looks up by this submission's own localClosureUuid", async () => {
        repository.create.mockResolvedValue(closureRow());
        await service.create(dto, authHeader);
        expect(repository.findByLocalClosureUuid).toHaveBeenCalledWith(dto.localClosureUuid);
      });
    });

    describe('CLOSURE_REVIEW linkage', () => {
      function pendingClosure() {
        return closureRow({ supervisorStatus: 'PENDING' as const });
      }

      beforeEach(() => {
        lookupClient.resolveClosureReasonCode.mockResolvedValue('MIGRATION');
      });

      it('raises a CLOSURE_REVIEW card when the closure needs supervisor review', async () => {
        const created = pendingClosure();
        repository.create.mockResolvedValue(created);
        lookupClient.resolveApprovalStatusId.mockResolvedValue('pending-lookup-id');

        await service.create(dto, authHeader);

        expect(lookupClient.resolveApprovalStatusId).toHaveBeenCalledWith('PENDING', authHeader);
        expect(approvalClient.create).toHaveBeenCalledWith(
          {
            requestType: 'CLOSURE_REVIEW',
            beneficiaryId: created.beneficiaryId,
            sourceEntityType: 'Closure',
            sourceEntityId: created.id,
            closureId: created.id,
            requestedByUserId: created.submittedByUserId,
            decisionStatusLookupId: 'pending-lookup-id',
          },
          authHeader,
        );
      });

      it('does not close the beneficiary when the closure needs supervisor review', async () => {
        repository.create.mockResolvedValue(pendingClosure());
        lookupClient.resolveApprovalStatusId.mockResolvedValue('pending-lookup-id');

        await service.create(dto, authHeader);

        expect(beneficiaryClient.closeCase).not.toHaveBeenCalled();
      });

      it('still returns the created closure when raising the card fails', async () => {
        const created = pendingClosure();
        repository.create.mockResolvedValue(created);
        lookupClient.resolveApprovalStatusId.mockResolvedValue('pending-lookup-id');
        approvalClient.create.mockRejectedValue(
          Object.assign(new Error('Bad gateway'), { status: 502 }),
        );

        await expect(service.create(dto, authHeader)).resolves.toBe(created);
        expect(consoleErrorSpy).toHaveBeenCalled();
      });
    });

    describe('immediate beneficiary closure (no supervisor review needed)', () => {
      it('closes the beneficiary for a MEDICAL closure', async () => {
        const created = closureRow({ closureType: 'MEDICAL', supervisorStatus: null });
        repository.create.mockResolvedValue(created);

        await service.create(dto, authHeader);

        expect(beneficiaryClient.closeCase).toHaveBeenCalledWith(
          created.beneficiaryId,
          'MEDICAL',
          authHeader,
        );
      });

      it('closes the beneficiary for a NON_MEDICAL closure', async () => {
        const created = closureRow({ closureType: 'NON_MEDICAL', supervisorStatus: null });
        repository.create.mockResolvedValue(created);

        await service.create({ ...dto, closureType: 'NON_MEDICAL' }, authHeader);

        expect(beneficiaryClient.closeCase).toHaveBeenCalledWith(
          created.beneficiaryId,
          'NON_MEDICAL',
          authHeader,
        );
      });

      it('closes the beneficiary for a PROGRAM_COMPLETION closure', async () => {
        const created = closureRow({ closureType: 'PROGRAM_COMPLETION', supervisorStatus: null });
        repository.create.mockResolvedValue(created);

        await service.create({ ...dto, closureType: 'PROGRAM_COMPLETION' }, authHeader);

        expect(beneficiaryClient.closeCase).toHaveBeenCalledWith(
          created.beneficiaryId,
          'PROGRAM_COMPLETION',
          authHeader,
        );
      });

      it('still returns the created closure when closing the beneficiary fails', async () => {
        const created = closureRow({ supervisorStatus: null });
        repository.create.mockResolvedValue(created);
        beneficiaryClient.closeCase.mockRejectedValue(
          Object.assign(new Error('Bad gateway'), { status: 502 }),
        );

        await expect(service.create(dto, authHeader)).resolves.toBe(created);
        expect(consoleErrorSpy).toHaveBeenCalled();
      });
    });
  });

  describe('decide', () => {
    function pendingClosure() {
      return closureRow({ supervisorStatus: 'PENDING' as const });
    }

    it('approves a PENDING closure and notifies the Sakhi', async () => {
      const pending = pendingClosure();
      const decided = { ...pending, supervisorStatus: 'APPROVED' as const, supervisorId };
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
      repository.decide.mockResolvedValue(true);

      const dto: DecideClosureInput = { decision: 'APPROVED' };
      await expect(service.decide(pending.id, supervisorId, dto, authHeader)).resolves.toBe(
        decided,
      );
      expect(repository.decide).toHaveBeenCalledWith(pending.id, supervisorId, dto);
      expect(notificationClient.notify).toHaveBeenCalledWith(
        pending.submittedByUserId,
        'CLOSURE_REVIEW_UPDATE',
        expect.any(String),
        expect.any(String),
        authHeader,
      );
    });

    it('closes the beneficiary on APPROVED', async () => {
      const pending = pendingClosure();
      const decided = { ...pending, supervisorStatus: 'APPROVED' as const, supervisorId };
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
      repository.decide.mockResolvedValue(true);

      await service.decide(pending.id, supervisorId, { decision: 'APPROVED' }, authHeader);

      expect(beneficiaryClient.closeCase).toHaveBeenCalledWith(
        pending.beneficiaryId,
        pending.closureType,
        authHeader,
      );
    });

    it('does not close the beneficiary on REJECTED', async () => {
      const pending = pendingClosure();
      const decided = { ...pending, supervisorStatus: 'REJECTED' as const, supervisorId };
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
      repository.decide.mockResolvedValue(true);

      await service.decide(pending.id, supervisorId, { decision: 'REJECTED' }, authHeader);

      expect(beneficiaryClient.closeCase).not.toHaveBeenCalled();
    });

    it('does not fail the decision when closing the beneficiary fails after APPROVED', async () => {
      const pending = pendingClosure();
      const decided = { ...pending, supervisorStatus: 'APPROVED' as const, supervisorId };
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
      repository.decide.mockResolvedValue(true);
      beneficiaryClient.closeCase.mockRejectedValue(
        Object.assign(new Error('Bad gateway'), { status: 502 }),
      );

      await expect(
        service.decide(pending.id, supervisorId, { decision: 'APPROVED' }, authHeader),
      ).resolves.toBe(decided);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('rejects a PENDING closure', async () => {
      const pending = pendingClosure();
      const decided = { ...pending, supervisorStatus: 'REJECTED' as const, supervisorId };
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
      repository.decide.mockResolvedValue(true);

      const result = await service.decide(
        pending.id,
        supervisorId,
        { decision: 'REJECTED' },
        authHeader,
      );
      expect(result?.supervisorStatus).toBe('REJECTED');
    });

    it('404s on an unknown id', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        service.decide('unknown-id', supervisorId, { decision: 'APPROVED' }, authHeader),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.decide).not.toHaveBeenCalled();
    });

    it('422s when the closure does not require supervisor review', async () => {
      repository.findById.mockResolvedValue(closureRow({ supervisorStatus: null }));
      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          supervisorId,
          { decision: 'APPROVED' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(repository.decide).not.toHaveBeenCalled();
    });

    it('409s on an already-APPROVED closure', async () => {
      repository.findById.mockResolvedValue(closureRow({ supervisorStatus: 'APPROVED' as const }));
      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          supervisorId,
          { decision: 'REJECTED' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.decide).not.toHaveBeenCalled();
    });

    it('409s when the conditional update races with a concurrent decision', async () => {
      repository.findById.mockResolvedValueOnce(pendingClosure());
      repository.decide.mockResolvedValue(false);
      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          supervisorId,
          { decision: 'APPROVED' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('does not fail the request when notifying the Sakhi throws after the decision is committed', async () => {
      const pending = pendingClosure();
      const decided = { ...pending, supervisorStatus: 'APPROVED' as const, supervisorId };
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
  });
});
