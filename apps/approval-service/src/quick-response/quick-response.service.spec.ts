import { QuickResponseService } from './quick-response.service';
import type { QuickResponseRepository } from './quick-response.repository';
import type { LookupClient } from './lookup.client';
import type { EscalationClient } from './escalation.client';
import type { ReopenRequestClient } from './reopen-request.client';
import type { NotificationClient } from './notification.client';
import type { AuditClient } from './audit.client';

function approvalRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    requestType: 'REOPEN' as const,
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
    reopenRequestId: '33333333-3333-3333-3333-333333333333',
    requestedByUserId: '44444444-4444-4444-4444-444444444444',
    approverUserId: null,
    requestPayloadJson: null,
    decisionStatusLookupId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    decisionPayloadJson: null,
    decidedAt: null,
    createdAt: new Date('2026-08-05T10:00:00.000Z'),
    createdByUserId: null,
    updatedAt: new Date('2026-08-05T10:00:00.000Z'),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

describe('QuickResponseService', () => {
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<QuickResponseRepository>;
  const lookupClient = {
    resolveApprovalStatusId: jest.fn(),
  } as unknown as jest.Mocked<LookupClient>;
  const escalationClient = { list: jest.fn() } as unknown as jest.Mocked<EscalationClient>;
  const reopenRequestClient = { decide: jest.fn() } as unknown as jest.Mocked<ReopenRequestClient>;
  const notificationClient = { notify: jest.fn() } as unknown as jest.Mocked<NotificationClient>;
  const auditClient = { log: jest.fn() } as unknown as jest.Mocked<AuditClient>;
  let service: QuickResponseService;
  const authHeader = 'Bearer token';
  const supervisor = { id: '55555555-5555-5555-5555-555555555555' };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new QuickResponseService(
      repository,
      lookupClient,
      escalationClient,
      reopenRequestClient,
      notificationClient,
      auditClient,
    );
  });

  describe('list', () => {
    it('merges approval_requests and escalation_events sorted by raisedAt DESC', async () => {
      lookupClient.resolveApprovalStatusId.mockResolvedValue(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      );
      repository.findMany.mockResolvedValue([
        approvalRequest({ createdAt: new Date('2026-08-05T09:00:00.000Z') }),
      ]);
      escalationClient.list.mockResolvedValue({
        cards: [
          {
            cardId: '66666666-6666-6666-6666-666666666666',
            cardType: 'EDD_NEARING',
            cardSource: 'escalation_events',
            beneficiaryId: '77777777-7777-7777-7777-777777777777',
            visitId: null,
            referralId: null,
            escalationType: 'EDD_NEARING',
            status: 'OPEN',
            raisedAt: '2026-08-05T11:00:00.000Z',
          },
        ],
        nextCursor: null,
      });

      const result = await service.list({ status: 'PENDING', limit: 50 }, authHeader);
      expect(result.cards).toHaveLength(2);
      expect(result.cards[0].cardId).toBe('66666666-6666-6666-6666-666666666666');
      expect(result.cards[1].cardId).toBe('11111111-1111-1111-1111-111111111111');
    });

    it('maps status=PENDING to OPEN for the escalation-events call', async () => {
      lookupClient.resolveApprovalStatusId.mockResolvedValue(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      );
      repository.findMany.mockResolvedValue([]);
      escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });

      await service.list({ status: 'PENDING', limit: 50 }, authHeader);
      expect(escalationClient.list).toHaveBeenCalledWith('OPEN', undefined, 50, authHeader);
    });

    it('returns an empty list when the APPROVAL_STATUS lookup value is unknown', async () => {
      lookupClient.resolveApprovalStatusId.mockResolvedValue(null);
      escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });

      const result = await service.list({ status: 'BOGUS', limit: 50 }, authHeader);
      expect(result.cards).toHaveLength(0);
      expect(repository.findMany).not.toHaveBeenCalled();
    });

    it('rejects a malformed cursor with a 400', async () => {
      await expect(
        service.list({ status: 'PENDING', cursor: 'not-valid!!', limit: 50 }, authHeader),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('decide — EDD_NEARING (escalation_events)', () => {
    it('acknowledges OKAY with no audit/notify side effects', async () => {
      const result = await service.decide(
        '66666666-6666-6666-6666-666666666666',
        supervisor,
        { cardSource: 'escalation_events', decision: 'OKAY' },
        authHeader,
      );
      expect(result).toMatchObject({ decision: 'OKAY', acknowledged: true });
      expect(auditClient.log).not.toHaveBeenCalled();
      expect(notificationClient.notify).not.toHaveBeenCalled();
    });

    it('501s a non-OKAY decision on an escalation card', async () => {
      await expect(
        service.decide(
          '66666666-6666-6666-6666-666666666666',
          supervisor,
          { cardSource: 'escalation_events', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 501 });
    });
  });

  describe('decide — REOPEN (approval_requests)', () => {
    it('approves: decides via ReopenRequestClient, audits, and notifies the Sakhi', async () => {
      repository.findById.mockResolvedValue(approvalRequest());
      reopenRequestClient.decide.mockResolvedValue({
        id: '33333333-3333-3333-3333-333333333333',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        supervisorStatus: 'APPROVED',
      });

      const result = await service.decide(
        '11111111-1111-1111-1111-111111111111',
        supervisor,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        authHeader,
      );

      expect(reopenRequestClient.decide).toHaveBeenCalledWith(
        '33333333-3333-3333-3333-333333333333',
        'APPROVED',
        undefined,
        undefined,
        authHeader,
      );
      expect(auditClient.log).toHaveBeenCalledTimes(1);
      expect(notificationClient.notify).toHaveBeenCalledWith(
        '44444444-4444-4444-4444-444444444444',
        'REOPEN_UPDATE',
        expect.any(String),
        expect.any(String),
        authHeader,
      );
      expect(result.decision).toBe('APPROVE');
    });

    it('rejects: persisted as REJECTED — "Cannot re-open" per product decision, audit/notify still fire', async () => {
      repository.findById.mockResolvedValue(approvalRequest());
      reopenRequestClient.decide.mockResolvedValue({
        id: '33333333-3333-3333-3333-333333333333',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        supervisorStatus: 'REJECTED',
      });

      await service.decide(
        '11111111-1111-1111-1111-111111111111',
        supervisor,
        { cardSource: 'approval_requests', decision: 'REJECT' },
        authHeader,
      );
      expect(auditClient.log).toHaveBeenCalledTimes(1);
      expect(notificationClient.notify).toHaveBeenCalledTimes(1);
    });

    it('404s on an unknown cardId', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        service.decide(
          'unknown-id',
          supervisor,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('propagates a 409 from closure-reopen-service (already-decided reopen request)', async () => {
      repository.findById.mockResolvedValue(approvalRequest());
      const conflictError = Object.assign(new Error('Already decided'), { status: 409 });
      reopenRequestClient.decide.mockRejectedValue(conflictError);

      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          supervisor,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(auditClient.log).not.toHaveBeenCalled();
      expect(notificationClient.notify).not.toHaveBeenCalled();
    });

    it('rejects an invalid decision value for a REOPEN card', async () => {
      repository.findById.mockResolvedValue(approvalRequest());
      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          supervisor,
          { cardSource: 'approval_requests', decision: 'OKAY' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe('decide — the other 6 stubbed card types', () => {
    it.each([
      'LMP_CHANGE',
      'ACCOMPANIED_REFERRAL',
      'CLOSURE_REVIEW',
      'REFERRAL_INCOMPLETE',
      'DATA_RESTORE',
    ])('501s a decision on a %s card', async (requestType) => {
      repository.findById.mockResolvedValue(approvalRequest({ requestType }));
      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          supervisor,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 501 });
    });
  });
});
