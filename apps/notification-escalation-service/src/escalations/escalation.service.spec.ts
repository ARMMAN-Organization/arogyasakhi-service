import { EscalationService } from './escalation.service';
import type { EscalationRepository } from './escalation.repository';
import type { ListEscalationEventsInput } from './dto/list-escalation-events.dto';
import type { NotificationRepository } from '../notifications/notification.repository';
import type { BeneficiaryClient } from './beneficiary.client';
import type { ManagerNoticeClient } from './manager-notice.client';
import type { LookupClient } from './lookup.client';
import type { EscalationType } from '../../../../node_modules/.prisma/client-notification-escalation-service';

function row(overrides: { id?: string; escalationType?: EscalationType; createdAt?: Date } = {}) {
  return {
    id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    visitId: null,
    referralId: null,
    escalationType: overrides.escalationType ?? ('ANC_2_MISSED' as const),
    triggerRuleVersionId: null,
    status: 'OPEN' as const,
    assignedSupervisorId: null,
    visitsMissedCount: null,
    resolvedAt: null,
    reviewDeadlineAt: null,
    actionTaken: null,
    pendingReasonLookupValueId: null,
    pendingReasonNotes: null,
    pendingReasonSubmittedAt: null,
    createdAt: overrides.createdAt ?? new Date('2026-08-05T10:00:00.000Z'),
    createdByUserId: null,
    updatedAt: overrides.createdAt ?? new Date('2026-08-05T10:00:00.000Z'),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
  };
}

describe('EscalationService', () => {
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateStatus: jest.fn(),
    updatePendingReason: jest.fn(),
  } as unknown as jest.Mocked<EscalationRepository>;
  const notificationRepository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<NotificationRepository>;
  let service: EscalationService;
  const baseQuery: ListEscalationEventsInput = { status: 'OPEN', limit: 50 };
  const AUTH_HEADER = 'Bearer test-token';

  beforeEach(() => {
    jest.resetAllMocks();
    service = new EscalationService(repository, notificationRepository);
  });

  it('groups every *_MISSED escalation type under MISSED_VISIT', async () => {
    repository.findMany.mockResolvedValue([row({ escalationType: 'PP_HR_MISSED' })]);
    const result = await service.list(baseQuery);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].cardType).toBe('MISSED_VISIT');
    expect(result.cards[0].cardSource).toBe('escalation_events');
  });

  it('surfaces EDD_NEARING as its own card type', async () => {
    repository.findMany.mockResolvedValue([row({ escalationType: 'EDD_NEARING' })]);
    const result = await service.list(baseQuery);
    expect(result.cards[0].cardType).toBe('EDD_NEARING');
  });

  it('omits escalation types outside the 8 supported Quick Response card types', async () => {
    repository.findMany.mockResolvedValue([row({ escalationType: 'SYNC_DELAY' })]);
    const result = await service.list(baseQuery);
    expect(result.cards).toHaveLength(0);
  });

  it('returns no nextCursor when the repository returns exactly `limit` rows', async () => {
    repository.findMany.mockResolvedValue([row()]);
    const result = await service.list({ ...baseQuery, limit: 1 });
    expect(result.nextCursor).toBeNull();
  });

  it('returns a nextCursor and trims to `limit` when more rows exist', async () => {
    const rows = [
      row({ id: 'a', createdAt: new Date('2026-08-05T10:00:02.000Z') }),
      row({ id: 'b', createdAt: new Date('2026-08-05T10:00:01.000Z') }),
    ];
    repository.findMany.mockResolvedValue(rows);
    const result = await service.list({ ...baseQuery, limit: 1 });
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].cardId).toBe('a');
    expect(result.nextCursor).not.toBeNull();
  });

  it('decodes a previously issued cursor back into a repository filter', async () => {
    repository.findMany.mockResolvedValue([]);
    const cursor = Buffer.from(
      '2026-08-05T10:00:00.000Z|11111111-1111-1111-1111-111111111111',
    ).toString('base64url');
    await service.list({ ...baseQuery, cursor });
    expect(repository.findMany).toHaveBeenCalledWith(
      { ...baseQuery, cursor },
      {
        createdAt: new Date('2026-08-05T10:00:00.000Z'),
        id: '11111111-1111-1111-1111-111111111111',
      },
    );
  });

  it('rejects a malformed cursor with a 400', async () => {
    await expect(
      service.list({ ...baseQuery, cursor: 'not-valid-base64!!' }),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.findMany).not.toHaveBeenCalled();
  });

  describe('create', () => {
    it('creates a Missed-Visit-type escalation row', async () => {
      const created = row({ escalationType: 'ANC_2_MISSED' });
      repository.create.mockResolvedValue(created);

      const result = await service.create(
        { beneficiaryId: created.beneficiaryId, escalationType: 'ANC_2_MISSED' },
        'admin-user-id',
      );

      expect(result).toBe(created);
      expect(repository.create).toHaveBeenCalledWith(
        { beneficiaryId: created.beneficiaryId, escalationType: 'ANC_2_MISSED' },
        'admin-user-id',
      );
    });

    it('creates an EDD_NEARING escalation row', async () => {
      const created = row({ escalationType: 'EDD_NEARING' });
      repository.create.mockResolvedValue(created);

      const result = await service.create(
        { beneficiaryId: created.beneficiaryId, escalationType: 'EDD_NEARING' },
        'admin-user-id',
      );

      expect(result).toBe(created);
      expect(result.status).toBe('OPEN');
    });

    it('passes optional fields through to the repository unchanged', async () => {
      const created = row({ escalationType: 'ANC_2_MISSED' });
      repository.create.mockResolvedValue(created);
      const input = {
        beneficiaryId: created.beneficiaryId,
        escalationType: 'ANC_2_MISSED' as const,
        visitId: '33333333-3333-3333-3333-333333333333',
        referralId: '44444444-4444-4444-4444-444444444444',
        visitsMissedCount: 2,
        assignedSupervisorId: '55555555-5555-5555-5555-555555555555',
      };

      await service.create(input, 'admin-user-id');

      expect(repository.create).toHaveBeenCalledWith(input, 'admin-user-id');
    });
  });

  describe('findById', () => {
    it('returns the card shape for a supported card type', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'EDD_NEARING' }));
      const result = await service.findById('11111111-1111-1111-1111-111111111111');
      expect(result).toMatchObject({ cardType: 'EDD_NEARING', cardSource: 'escalation_events' });
    });

    it('returns null when the row does not exist', async () => {
      repository.findById.mockResolvedValue(null);
      const result = await service.findById('unknown-id');
      expect(result).toBeNull();
    });

    it('returns null for an escalation type outside the 8 supported card types', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'SYNC_DELAY' }));
      const result = await service.findById('11111111-1111-1111-1111-111111111111');
      expect(result).toBeNull();
    });
  });

  describe('getMissedVisitDetail', () => {
    it('returns the detail shape for a supported card type', async () => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: 'ANC_2_MISSED' }),
        visitsMissedCount: 2,
      });
      const result = await service.getMissedVisitDetail('11111111-1111-1111-1111-111111111111');
      expect(result).toEqual({
        id: '11111111-1111-1111-1111-111111111111',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        visitsMissedCount: 2,
        visitType: 'ANC',
        requestedAt: '2026-08-05T10:00:00.000Z',
        status: 'PENDING',
      });
    });

    it('maps TRANSFER_REQUESTED to TRANSFERRED', async () => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: 'ANC_2_MISSED' }),
        status: 'TRANSFER_REQUESTED' as const,
        visitsMissedCount: null,
      });
      const result = await service.getMissedVisitDetail('11111111-1111-1111-1111-111111111111');
      expect(result.status).toBe('TRANSFERRED');
    });

    it('maps RESOLVED to CLOSED', async () => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: 'ANC_2_MISSED' }),
        status: 'RESOLVED' as const,
        visitsMissedCount: null,
      });
      const result = await service.getMissedVisitDetail('11111111-1111-1111-1111-111111111111');
      expect(result.status).toBe('CLOSED');
    });

    it('maps DISMISSED to CLOSED', async () => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: 'ANC_2_MISSED' }),
        status: 'DISMISSED' as const,
        visitsMissedCount: null,
      });
      const result = await service.getMissedVisitDetail('11111111-1111-1111-1111-111111111111');
      expect(result.status).toBe('CLOSED');
    });

    it('falls back to PENDING for a status this card type does not use', async () => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: 'ANC_2_MISSED' }),
        status: 'CLOSE_REQUESTED' as const,
        visitsMissedCount: null,
      });
      const result = await service.getMissedVisitDetail('11111111-1111-1111-1111-111111111111');
      expect(result.status).toBe('PENDING');
    });

    it.each([
      ['ANC_HR_MISSED', 'ANC'],
      ['PP_HR_MISSED', 'PP'],
      ['NN_HR_MISSED', 'NN'],
      ['INC_2_MISSED', 'INC'],
      ['INC_HR_MISSED', 'INC-HR'],
      ['CCV_MISSED', 'CCV'],
      ['CCV_HR_MISSED', 'CCV-HR'],
    ])('maps %s to visitType %s', async (escalationType, visitType) => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: escalationType as EscalationType }),
        visitsMissedCount: null,
      });
      const result = await service.getMissedVisitDetail('11111111-1111-1111-1111-111111111111');
      expect(result.visitType).toBe(visitType);
    });

    it('passes through a null visitsMissedCount', async () => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: 'ANC_2_MISSED' }),
        visitsMissedCount: null,
      });
      const result = await service.getMissedVisitDetail('11111111-1111-1111-1111-111111111111');
      expect(result.visitsMissedCount).toBeNull();
    });

    it('404s on an unknown id', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.getMissedVisitDetail('unknown-id')).rejects.toMatchObject({
        status: 404,
      });
    });

    it('422s when the escalation is not a Missed Visit type', async () => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: 'EDD_NEARING' }),
        visitsMissedCount: null,
      });
      await expect(
        service.getMissedVisitDetail('11111111-1111-1111-1111-111111111111'),
      ).rejects.toMatchObject({ status: 422 });
    });
  });

  describe('getEddNearingDetail', () => {
    const beneficiaryClient = {
      getById: jest.fn(),
    } as unknown as jest.Mocked<BeneficiaryClient>;
    let eddService: EscalationService;

    beforeEach(() => {
      eddService = new EscalationService(repository, notificationRepository, beneficiaryClient);
      beneficiaryClient.getById.mockResolvedValue({
        id: '22222222-2222-2222-2222-222222222222',
        sakhiId: 'sakhi-a',
        motherCaseDetails: { eddDate: '2027-03-01T00:00:00.000Z' },
        pii: { fullName: 'Jane Doe' },
      });
    });

    it('returns the detail shape with a computed reason', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'EDD_NEARING' }));
      const result = await eddService.getEddNearingDetail(
        '11111111-1111-1111-1111-111111111111',
        AUTH_HEADER,
      );
      expect(result).toEqual({
        id: '11111111-1111-1111-1111-111111111111',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        eddDate: '2027-03-01',
        reason: 'EDD approaching on 2027-03-01',
        requestedAt: '2026-08-05T10:00:00.000Z',
        status: 'PENDING',
      });
    });

    it('maps ACKNOWLEDGED to ACKNOWLEDGED', async () => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: 'EDD_NEARING' }),
        status: 'ACKNOWLEDGED' as const,
      });
      const result = await eddService.getEddNearingDetail(
        '11111111-1111-1111-1111-111111111111',
        AUTH_HEADER,
      );
      expect(result.status).toBe('ACKNOWLEDGED');
    });

    it('falls back to PENDING for a status this card type does not use', async () => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: 'EDD_NEARING' }),
        status: 'RESOLVED' as const,
      });
      const result = await eddService.getEddNearingDetail(
        '11111111-1111-1111-1111-111111111111',
        AUTH_HEADER,
      );
      expect(result.status).toBe('PENDING');
    });

    it('returns null eddDate/reason when motherCaseDetails is null', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'EDD_NEARING' }));
      beneficiaryClient.getById.mockResolvedValue({
        id: '22222222-2222-2222-2222-222222222222',
        sakhiId: 'sakhi-a',
        motherCaseDetails: null,
        pii: { fullName: 'Jane Doe' },
      });
      const result = await eddService.getEddNearingDetail(
        '11111111-1111-1111-1111-111111111111',
        AUTH_HEADER,
      );
      expect(result.eddDate).toBeNull();
      expect(result.reason).toBeNull();
    });

    it('404s on an unknown id', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(eddService.getEddNearingDetail('unknown-id', AUTH_HEADER)).rejects.toMatchObject(
        { status: 404 },
      );
      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
    });

    it('422s when the escalation is not EDD_NEARING', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'ANC_2_MISSED' }));
      await expect(
        eddService.getEddNearingDetail('11111111-1111-1111-1111-111111111111', AUTH_HEADER),
      ).rejects.toMatchObject({ status: 422 });
      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
    });

    it('propagates a beneficiary-service failure instead of swallowing it', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'EDD_NEARING' }));
      beneficiaryClient.getById.mockRejectedValue(new Error('beneficiary-service down'));
      await expect(
        eddService.getEddNearingDetail('11111111-1111-1111-1111-111111111111', AUTH_HEADER),
      ).rejects.toThrow('beneficiary-service down');
    });
  });

  describe('acknowledgeEddNearing', () => {
    it('OPEN -> ACKNOWLEDGED for an EDD_NEARING escalation', async () => {
      const pending = row({ escalationType: 'EDD_NEARING' });
      const acknowledged = { ...pending, status: 'ACKNOWLEDGED' as const };
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(acknowledged);
      repository.updateStatus.mockResolvedValue(true);

      await expect(service.acknowledgeEddNearing(pending.id)).resolves.toBe(acknowledged);
      expect(repository.updateStatus).toHaveBeenCalledWith(
        pending.id,
        'OPEN',
        'ACKNOWLEDGED',
        null,
      );
    });

    it('404s on an unknown id', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(service.acknowledgeEddNearing('unknown-id')).rejects.toMatchObject({
        status: 404,
      });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('422s when the escalation is not EDD_NEARING', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'ANC_2_MISSED' }));
      await expect(
        service.acknowledgeEddNearing('11111111-1111-1111-1111-111111111111'),
      ).rejects.toMatchObject({ status: 422 });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('409s when already decided', async () => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: 'EDD_NEARING' }),
        status: 'ACKNOWLEDGED' as const,
      });
      await expect(
        service.acknowledgeEddNearing('11111111-1111-1111-1111-111111111111'),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('409s when the conditional update races with a concurrent decision', async () => {
      repository.findById.mockResolvedValueOnce(row({ escalationType: 'EDD_NEARING' }));
      repository.updateStatus.mockResolvedValue(false);
      await expect(
        service.acknowledgeEddNearing('11111111-1111-1111-1111-111111111111'),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('decideMissedVisit', () => {
    const beneficiaryClient = {
      getById: jest.fn(),
    } as unknown as jest.Mocked<BeneficiaryClient>;
    let closeService: EscalationService;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      closeService = new EscalationService(repository, notificationRepository, beneficiaryClient);
      beneficiaryClient.getById.mockResolvedValue({
        id: '22222222-2222-2222-2222-222222222222',
        sakhiId: 'sakhi-a',
        motherCaseDetails: null,
        pii: { fullName: 'Jane Doe' },
      });
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('CLOSE: OPEN -> RESOLVED and notifies the Sakhi', async () => {
      const pending = row({ escalationType: 'ANC_2_MISSED' });
      const resolved = { ...pending, status: 'RESOLVED' as const, actionTaken: 'CLOSE' };
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(resolved);
      repository.updateStatus.mockResolvedValue(true);

      const result = await closeService.decideMissedVisit(pending.id, 'CLOSE', AUTH_HEADER);

      expect(result).toBe(resolved);
      expect(repository.updateStatus).toHaveBeenCalledWith(pending.id, 'OPEN', 'RESOLVED', 'CLOSE');
      expect(notificationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: 'sakhi-a',
          notificationType: 'MISSED_VISIT_ESCALATION',
          linkedEntityId: pending.id,
        }),
      );
    });

    it('does not fail the request when notifying the Sakhi fails', async () => {
      const pending = row({ escalationType: 'ANC_2_MISSED' });
      const resolved = { ...pending, status: 'RESOLVED' as const, actionTaken: 'CLOSE' };
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(resolved);
      repository.updateStatus.mockResolvedValue(true);
      // First call is the roster-scoping check (must succeed to proceed at all);
      // the second is the CLOSE branch's own lookup for the Sakhi notification.
      beneficiaryClient.getById
        .mockResolvedValueOnce({
          id: '22222222-2222-2222-2222-222222222222',
          sakhiId: 'sakhi-a',
          motherCaseDetails: null,
          pii: { fullName: 'Jane Doe' },
        })
        .mockRejectedValueOnce(new Error('beneficiary-service down'));

      await expect(closeService.decideMissedVisit(pending.id, 'CLOSE', AUTH_HEADER)).resolves.toBe(
        resolved,
      );
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('404s on an unknown id', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        closeService.decideMissedVisit('unknown-id', 'CLOSE', AUTH_HEADER),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('422s when the escalation is not a Missed Visit type', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'EDD_NEARING' }));
      await expect(
        closeService.decideMissedVisit(
          '11111111-1111-1111-1111-111111111111',
          'CLOSE',
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('409s when already decided', async () => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: 'ANC_2_MISSED' }),
        status: 'RESOLVED' as const,
      });
      await expect(
        closeService.decideMissedVisit(
          '11111111-1111-1111-1111-111111111111',
          'CLOSE',
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });
  });

  describe('decideMissedVisit TRANSFER', () => {
    const beneficiaryClient = {
      getById: jest.fn(),
      markPendingTransfer: jest.fn(),
    } as unknown as jest.Mocked<BeneficiaryClient>;
    const managerNoticeClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<ManagerNoticeClient>;
    let transferService: EscalationService;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
      transferService = new EscalationService(
        repository,
        notificationRepository,
        beneficiaryClient,
        managerNoticeClient,
      );
      beneficiaryClient.getById.mockResolvedValue({
        id: '22222222-2222-2222-2222-222222222222',
        sakhiId: 'sakhi-a',
        motherCaseDetails: null,
        pii: { fullName: 'Jane Doe' },
      });
      beneficiaryClient.markPendingTransfer.mockResolvedValue(undefined);
      managerNoticeClient.send.mockResolvedValue({
        sent: true,
        managerEmail: 'manager@example.com',
        usedFallback: false,
      });
      consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    });

    afterEach(() => {
      consoleErrorSpy.mockRestore();
    });

    it('moves OPEN -> TRANSFER_REQUESTED with a ~15-day review deadline and no resolvedAt', async () => {
      const pending = row({ escalationType: 'ANC_2_MISSED' });
      const transferred = {
        ...pending,
        status: 'TRANSFER_REQUESTED' as const,
        actionTaken: 'TRANSFER',
      };
      repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(transferred);
      repository.updateStatus.mockResolvedValue(true);

      const result = await transferService.decideMissedVisit(pending.id, 'TRANSFER', AUTH_HEADER);

      expect(result).toBe(transferred);
      expect(repository.updateStatus).toHaveBeenCalledWith(
        pending.id,
        'OPEN',
        'TRANSFER_REQUESTED',
        'TRANSFER',
        expect.any(Date),
      );
      const reviewDeadlineAt = repository.updateStatus.mock.calls[0][4] as Date;
      const daysAhead = (reviewDeadlineAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
      expect(daysAhead).toBeGreaterThan(14.9);
      expect(daysAhead).toBeLessThan(15.1);
    });

    it("removes the beneficiary from the Sakhi's list, emails the Manager, and notifies the Sakhi", async () => {
      const pending = { ...row({ escalationType: 'ANC_2_MISSED' }), visitsMissedCount: 2 };
      repository.findById.mockResolvedValue(pending);
      repository.updateStatus.mockResolvedValue(true);

      await transferService.decideMissedVisit(pending.id, 'TRANSFER', AUTH_HEADER);

      expect(beneficiaryClient.markPendingTransfer).toHaveBeenCalledWith(
        pending.beneficiaryId,
        AUTH_HEADER,
      );
      expect(managerNoticeClient.send).toHaveBeenCalledWith(
        {
          sakhiId: 'sakhi-a',
          beneficiaryName: 'Jane Doe',
          visitsMissedCount: 2,
          visitType: 'ANC',
        },
        AUTH_HEADER,
      );
      expect(notificationRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientUserId: 'sakhi-a',
          notificationType: 'BENEFICIARY_TRANSFER_NOTICE',
          linkedEntityId: pending.id,
        }),
      );
    });

    it('404s on an unknown id', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        transferService.decideMissedVisit('unknown-id', 'TRANSFER', AUTH_HEADER),
      ).rejects.toMatchObject({ status: 404 });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('422s when the escalation is not a Missed Visit type', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'EDD_NEARING' }));
      await expect(
        transferService.decideMissedVisit(
          '11111111-1111-1111-1111-111111111111',
          'TRANSFER',
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('409s when already decided', async () => {
      repository.findById.mockResolvedValue({
        ...row({ escalationType: 'ANC_2_MISSED' }),
        status: 'RESOLVED' as const,
      });
      await expect(
        transferService.decideMissedVisit(
          '11111111-1111-1111-1111-111111111111',
          'TRANSFER',
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(repository.updateStatus).not.toHaveBeenCalled();
    });

    it('409s when the conditional update races with a concurrent decision', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'ANC_2_MISSED' }));
      repository.updateStatus.mockResolvedValue(false);
      await expect(
        transferService.decideMissedVisit(
          '11111111-1111-1111-1111-111111111111',
          'TRANSFER',
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
      // markPendingTransfer now runs BEFORE the conditional update (see
      // decideTransfer's doc comment) — it's expected to have already
      // happened by the time the update itself loses the race.
      expect(beneficiaryClient.markPendingTransfer).toHaveBeenCalled();
      expect(managerNoticeClient.send).not.toHaveBeenCalled();
    });

    it('propagates the error and leaves the escalation OPEN when removing the beneficiary from the roster fails', async () => {
      const pending = row({ escalationType: 'ANC_2_MISSED' });
      repository.findById.mockResolvedValue(pending);
      beneficiaryClient.markPendingTransfer.mockRejectedValue(
        new Error('beneficiary-service down'),
      );

      await expect(
        transferService.decideMissedVisit(pending.id, 'TRANSFER', AUTH_HEADER),
      ).rejects.toThrow('beneficiary-service down');
      // The escalation must not be committed to TRANSFER_REQUESTED until the
      // roster removal has actually succeeded — otherwise the card would be
      // permanently decided while the beneficiary never left the roster, with
      // no way to retry.
      expect(repository.updateStatus).not.toHaveBeenCalled();
      expect(managerNoticeClient.send).not.toHaveBeenCalled();
    });

    it('still returns 200 when emailing the Manager fails', async () => {
      const pending = row({ escalationType: 'ANC_2_MISSED' });
      repository.findById.mockResolvedValue(pending);
      repository.updateStatus.mockResolvedValue(true);
      managerNoticeClient.send.mockRejectedValue(new Error('auth-service down'));

      await expect(
        transferService.decideMissedVisit(pending.id, 'TRANSFER', AUTH_HEADER),
      ).resolves.toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
      // Independent of the Manager email — still attempted despite that failure.
      expect(notificationRepository.create).toHaveBeenCalled();
    });

    it('still returns 200, skipping the Manager email and Sakhi notification, when the beneficiary fetch fails', async () => {
      const pending = row({ escalationType: 'ANC_2_MISSED' });
      repository.findById.mockResolvedValue(pending);
      repository.updateStatus.mockResolvedValue(true);
      // First call is the roster-scoping check (must succeed to proceed at all);
      // the second is decideTransfer's own lookup for the Manager email/Sakhi notification.
      beneficiaryClient.getById
        .mockResolvedValueOnce({
          id: '22222222-2222-2222-2222-222222222222',
          sakhiId: 'sakhi-a',
          motherCaseDetails: null,
          pii: { fullName: 'Jane Doe' },
        })
        .mockRejectedValueOnce(new Error('beneficiary-service down'));

      await expect(
        transferService.decideMissedVisit(pending.id, 'TRANSFER', AUTH_HEADER),
      ).resolves.toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(managerNoticeClient.send).not.toHaveBeenCalled();
      expect(notificationRepository.create).not.toHaveBeenCalled();
      // Independent of the beneficiary fetch — still attempted.
      expect(beneficiaryClient.markPendingTransfer).toHaveBeenCalled();
    });

    it('still returns 200 when notifying the Sakhi fails', async () => {
      const pending = row({ escalationType: 'ANC_2_MISSED' });
      repository.findById.mockResolvedValue(pending);
      repository.updateStatus.mockResolvedValue(true);
      notificationRepository.create.mockRejectedValue(new Error('db error'));

      await expect(
        transferService.decideMissedVisit(pending.id, 'TRANSFER', AUTH_HEADER),
      ).resolves.toBeDefined();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('submitClosurePendingReason', () => {
    const beneficiaryClient = {
      getById: jest.fn(),
    } as unknown as jest.Mocked<BeneficiaryClient>;
    const lookupClient = {
      resolveClosurePendingReasonCode: jest.fn(),
    } as unknown as jest.Mocked<LookupClient>;
    let pendingReasonService: EscalationService;

    beforeEach(() => {
      pendingReasonService = new EscalationService(
        repository,
        notificationRepository,
        beneficiaryClient,
        undefined,
        lookupClient,
      );
      beneficiaryClient.getById.mockResolvedValue({
        id: '22222222-2222-2222-2222-222222222222',
        sakhiId: 'sakhi-a',
        motherCaseDetails: null,
        pii: { fullName: 'Jane Doe' },
      });
      lookupClient.resolveClosurePendingReasonCode.mockResolvedValue('INFORMATION_NOT_RECEIVED');
      repository.updatePendingReason.mockResolvedValue(true);
    });

    const INPUT = { pendingReasonLookupValueId: 'lookup-value-1' };

    it('404s on an unknown escalation id', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        pendingReasonService.submitClosurePendingReason('unknown-id', INPUT, AUTH_HEADER),
      ).rejects.toMatchObject({ status: 404 });
      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
    });

    it('422s when the escalation is not CLOSURE_PENDING', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'ANC_2_MISSED' }));
      await expect(
        pendingReasonService.submitClosurePendingReason(
          '11111111-1111-1111-1111-111111111111',
          INPUT,
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
    });

    it('409s when the escalation is no longer OPEN', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'CLOSURE_PENDING' }));
      repository.updatePendingReason.mockResolvedValue(false);
      await expect(
        pendingReasonService.submitClosurePendingReason(
          '11111111-1111-1111-1111-111111111111',
          INPUT,
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('propagates a beneficiary-service ownership failure as-is', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'CLOSURE_PENDING' }));
      beneficiaryClient.getById.mockRejectedValue(
        Object.assign(new Error('forbidden'), { status: 403 }),
      );
      await expect(
        pendingReasonService.submitClosurePendingReason(
          '11111111-1111-1111-1111-111111111111',
          INPUT,
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('400s when the lookupValueId does not resolve', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'CLOSURE_PENDING' }));
      lookupClient.resolveClosurePendingReasonCode.mockResolvedValue(null);
      await expect(
        pendingReasonService.submitClosurePendingReason(
          '11111111-1111-1111-1111-111111111111',
          INPUT,
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.updatePendingReason).not.toHaveBeenCalled();
    });

    it('400s when the reason is OTHER and notes is missing', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'CLOSURE_PENDING' }));
      lookupClient.resolveClosurePendingReasonCode.mockResolvedValue('OTHER');
      await expect(
        pendingReasonService.submitClosurePendingReason(
          '11111111-1111-1111-1111-111111111111',
          INPUT,
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(repository.updatePendingReason).not.toHaveBeenCalled();
    });

    it('accepts OTHER when notes is supplied', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'CLOSURE_PENDING' }));
      lookupClient.resolveClosurePendingReasonCode.mockResolvedValue('OTHER');
      await pendingReasonService.submitClosurePendingReason(
        '11111111-1111-1111-1111-111111111111',
        { ...INPUT, notes: 'Beneficiary moved away' },
        AUTH_HEADER,
      );
      expect(repository.updatePendingReason).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'lookup-value-1',
        'Beneficiary moved away',
      );
    });

    it('does not require notes for a non-OTHER reason', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'CLOSURE_PENDING' }));
      await pendingReasonService.submitClosurePendingReason(
        '11111111-1111-1111-1111-111111111111',
        INPUT,
        AUTH_HEADER,
      );
      expect(repository.updatePendingReason).toHaveBeenCalledWith(
        '11111111-1111-1111-1111-111111111111',
        'lookup-value-1',
        null,
      );
    });

    it('persists the reason without changing status, and returns the updated row', async () => {
      repository.findById
        .mockResolvedValueOnce(row({ escalationType: 'CLOSURE_PENDING' }))
        .mockResolvedValueOnce({
          ...row({ escalationType: 'CLOSURE_PENDING' }),
          pendingReasonLookupValueId: 'lookup-value-1',
        });

      const result = await pendingReasonService.submitClosurePendingReason(
        '11111111-1111-1111-1111-111111111111',
        INPUT,
        AUTH_HEADER,
      );

      expect(result?.status).toBe('OPEN');
      expect(result?.pendingReasonLookupValueId).toBe('lookup-value-1');
    });

    it('propagates a beneficiary-service unreachable failure', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'CLOSURE_PENDING' }));
      beneficiaryClient.getById.mockRejectedValue(
        Object.assign(new Error('bad gateway'), { status: 502 }),
      );
      await expect(
        pendingReasonService.submitClosurePendingReason(
          '11111111-1111-1111-1111-111111111111',
          INPUT,
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 502 });
    });

    it('propagates an auth-service (lookup) unreachable failure', async () => {
      repository.findById.mockResolvedValue(row({ escalationType: 'CLOSURE_PENDING' }));
      lookupClient.resolveClosurePendingReasonCode.mockRejectedValue(
        Object.assign(new Error('bad gateway'), { status: 502 }),
      );
      await expect(
        pendingReasonService.submitClosurePendingReason(
          '11111111-1111-1111-1111-111111111111',
          INPUT,
          AUTH_HEADER,
        ),
      ).rejects.toMatchObject({ status: 502 });
    });
  });
});
