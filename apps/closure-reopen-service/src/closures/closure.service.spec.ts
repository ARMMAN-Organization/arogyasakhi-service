import { ClosureService } from './closure.service';
import type { ClosureRepository } from './closure.repository';
import type { ApprovalClient } from '../reopen-requests/approval.client';
import type { LookupClient } from '../reopen-requests/lookup.client';
import type { NotificationClient } from '../reopen-requests/notification.client';
import type { CreateClosureInput } from './dto/create-closure.dto';
import type { DecideClosureInput } from './dto/decide-closure.dto';
import type { ClosureType } from '../../../../node_modules/.prisma/client-closure-reopen-service';

describe('ClosureService', () => {
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    decide: jest.fn(),
  } as unknown as jest.Mocked<ClosureRepository>;
  const approvalClient = { create: jest.fn() } as unknown as jest.Mocked<ApprovalClient>;
  const lookupClient = {
    resolveApprovalStatusId: jest.fn(),
  } as unknown as jest.Mocked<LookupClient>;
  const notificationClient = { notify: jest.fn() } as unknown as jest.Mocked<NotificationClient>;
  let service: ClosureService;
  const authHeader = 'Bearer token';
  const supervisorId = '44444444-4444-4444-4444-444444444444';
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    service = new ClosureService(repository, approvalClient, lookupClient, notificationClient);
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
    const rows = [
      {
        id: '11111111-1111-1111-1111-111111111111',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        closureType: 'MEDICAL' as ClosureType,
        closureReasonLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        eventDate: new Date('2026-06-01'),
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
      },
    ];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('creates via repository with the given data', async () => {
    const dto: CreateClosureInput = {
      beneficiaryId: '22222222-2222-2222-2222-222222222222',
      closureType: 'MEDICAL',
      closureReasonLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      eventDate: new Date('2026-06-01'),
      closureDate: new Date('2026-06-05'),
      submittedByUserId: '33333333-3333-3333-3333-333333333333',
    };
    const created = {
      id: '11111111-1111-1111-1111-111111111111',
      beneficiaryId: dto.beneficiaryId,
      closureType: dto.closureType as ClosureType,
      closureReasonLookupValueId: dto.closureReasonLookupValueId,
      eventDate: dto.eventDate ?? null,
      closureDate: dto.closureDate,
      submittedByUserId: dto.submittedByUserId,
      supervisorStatus: null,
      supervisorId: null,
      supervisorNotes: null,
      createdAt: new Date(),
      createdByUserId: null,
      updatedAt: new Date(),
      updatedByUserId: null,
      isDeleted: false,
      deletedAt: null,
    };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto, authHeader)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
    expect(approvalClient.create).not.toHaveBeenCalled();
  });

  it('propagates repository errors on create', async () => {
    const dto: CreateClosureInput = {
      beneficiaryId: '22222222-2222-2222-2222-222222222222',
      closureType: 'MEDICAL',
      closureReasonLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      closureDate: new Date('2026-06-05'),
      submittedByUserId: '33333333-3333-3333-3333-333333333333',
    };
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(service.create(dto, authHeader)).rejects.toThrow('db down');
  });

  describe('create — CLOSURE_REVIEW linkage', () => {
    const dto: CreateClosureInput = {
      beneficiaryId: '22222222-2222-2222-2222-222222222222',
      closureType: 'MEDICAL',
      closureReasonLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      closureDate: new Date('2026-06-05'),
      submittedByUserId: '33333333-3333-3333-3333-333333333333',
    };

    function pendingClosure() {
      return {
        id: '11111111-1111-1111-1111-111111111111',
        beneficiaryId: dto.beneficiaryId,
        closureType: dto.closureType as ClosureType,
        closureReasonLookupValueId: dto.closureReasonLookupValueId,
        eventDate: null,
        closureDate: dto.closureDate,
        submittedByUserId: dto.submittedByUserId,
        supervisorStatus: 'PENDING' as const,
        supervisorId: null,
        supervisorNotes: null,
        createdAt: new Date(),
        createdByUserId: null,
        updatedAt: new Date(),
        updatedByUserId: null,
        isDeleted: false,
        deletedAt: null,
      };
    }

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

    it('does not raise a card for a closure that does not need supervisor review', async () => {
      const created = {
        id: '11111111-1111-1111-1111-111111111111',
        beneficiaryId: dto.beneficiaryId,
        closureType: dto.closureType as ClosureType,
        closureReasonLookupValueId: dto.closureReasonLookupValueId,
        eventDate: null,
        closureDate: dto.closureDate,
        submittedByUserId: dto.submittedByUserId,
        supervisorStatus: null,
        supervisorId: null,
        supervisorNotes: null,
        createdAt: new Date(),
        createdByUserId: null,
        updatedAt: new Date(),
        updatedByUserId: null,
        isDeleted: false,
        deletedAt: null,
      };
      repository.create.mockResolvedValue(created);

      await service.create(dto, authHeader);

      expect(approvalClient.create).not.toHaveBeenCalled();
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

  describe('decide', () => {
    function pendingClosure() {
      return {
        id: '11111111-1111-1111-1111-111111111111',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        closureType: 'MEDICAL' as ClosureType,
        closureReasonLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        eventDate: null,
        closureDate: new Date('2026-06-05'),
        submittedByUserId: '33333333-3333-3333-3333-333333333333',
        supervisorStatus: 'PENDING' as const,
        supervisorId: null,
        supervisorNotes: null,
        createdAt: new Date(),
        createdByUserId: null,
        updatedAt: new Date(),
        updatedByUserId: null,
        isDeleted: false,
        deletedAt: null,
      };
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
      repository.findById.mockResolvedValue({ ...pendingClosure(), supervisorStatus: null });
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
      repository.findById.mockResolvedValue({
        ...pendingClosure(),
        supervisorStatus: 'APPROVED' as const,
      });
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
