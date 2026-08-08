import { QuickResponseService } from './quick-response.service';
import type { QuickResponseRepository } from './quick-response.repository';
import type { LookupClient } from './lookup.client';
import type { EscalationClient } from './escalation.client';
import type { ReopenRequestClient } from './reopen-request.client';
import type { BeneficiaryClient } from './beneficiary.client';
import type { NotificationClient } from './notification.client';
import type { ClosureClient } from './closure.client';
import type { ReferralClient } from './referral.client';
import type { IncentiveClient } from './incentive.client';
import type { UserClient } from './user.client';

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

function escalationCard(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    cardId: '66666666-6666-6666-6666-666666666666',
    cardType: 'EDD_NEARING' as const,
    cardSource: 'escalation_events' as const,
    beneficiaryId: '77777777-7777-7777-7777-777777777777',
    visitId: null,
    referralId: null,
    escalationType: 'EDD_NEARING',
    status: 'OPEN',
    raisedAt: '2026-08-05T11:00:00.000Z',
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
  const escalationClient = {
    list: jest.fn(),
    findById: jest.fn(),
  } as unknown as jest.Mocked<EscalationClient>;
  const reopenRequestClient = { decide: jest.fn() } as unknown as jest.Mocked<ReopenRequestClient>;
  const beneficiaryClient = {
    applyLmpChange: jest.fn(),
    getById: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  const notificationClient = { notify: jest.fn() } as unknown as jest.Mocked<NotificationClient>;
  const closureClient = { decide: jest.fn() } as unknown as jest.Mocked<ClosureClient>;
  const referralClient = { decide: jest.fn() } as unknown as jest.Mocked<ReferralClient>;
  const incentiveClient = {
    triggerAccompaniedReferral: jest.fn(),
  } as unknown as jest.Mocked<IncentiveClient>;
  const userClient = { reactivateUser: jest.fn() } as unknown as jest.Mocked<UserClient>;
  let service: QuickResponseService;
  const authHeader = 'Bearer token';
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.resetAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    service = new QuickResponseService(
      repository,
      lookupClient,
      escalationClient,
      reopenRequestClient,
      beneficiaryClient,
      notificationClient,
      closureClient,
      referralClient,
      incentiveClient,
      userClient,
    );
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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
        cards: [escalationCard()],
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

    it('skips the escalation-events call entirely for a non-PENDING status', async () => {
      lookupClient.resolveApprovalStatusId.mockResolvedValue(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      );
      repository.findMany.mockResolvedValue([]);

      const result = await service.list({ status: 'APPROVED', limit: 50 }, authHeader);
      expect(escalationClient.list).not.toHaveBeenCalled();
      expect(result.cards).toHaveLength(0);
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
      escalationClient.findById.mockResolvedValue(escalationCard());

      const result = await service.decide(
        '66666666-6666-6666-6666-666666666666',
        { cardSource: 'escalation_events', decision: 'OKAY' },
        authHeader,
      );
      expect(result).toMatchObject({ decision: 'OKAY', acknowledged: true });
    });

    it('404s when the escalation card does not exist', async () => {
      escalationClient.findById.mockResolvedValue(null);

      await expect(
        service.decide(
          '66666666-6666-6666-6666-666666666666',
          { cardSource: 'escalation_events', decision: 'OKAY' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('501s a non-OKAY decision on an escalation card', async () => {
      escalationClient.findById.mockResolvedValue(escalationCard());

      await expect(
        service.decide(
          '66666666-6666-6666-6666-666666666666',
          { cardSource: 'escalation_events', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 501 });
    });
  });

  describe('decide — REOPEN (approval_requests)', () => {
    it('approves: decides via ReopenRequestClient', async () => {
      repository.findById.mockResolvedValue(approvalRequest());
      reopenRequestClient.decide.mockResolvedValue({
        id: '33333333-3333-3333-3333-333333333333',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        supervisorStatus: 'APPROVED',
      });

      const result = await service.decide(
        '11111111-1111-1111-1111-111111111111',
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
      expect(result.decision).toBe('APPROVE');
    });

    it('rejects: persisted as REJECTED — "Cannot re-open" per product decision', async () => {
      repository.findById.mockResolvedValue(approvalRequest());
      reopenRequestClient.decide.mockResolvedValue({
        id: '33333333-3333-3333-3333-333333333333',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        supervisorStatus: 'REJECTED',
      });

      const result = await service.decide(
        '11111111-1111-1111-1111-111111111111',
        { cardSource: 'approval_requests', decision: 'REJECT' },
        authHeader,
      );
      expect(result.decision).toBe('REJECT');
    });

    it('404s on an unknown cardId', async () => {
      repository.findById.mockResolvedValue(null);
      await expect(
        service.decide(
          'unknown-id',
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
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('rejects an invalid decision value for a REOPEN card', async () => {
      repository.findById.mockResolvedValue(approvalRequest());
      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          { cardSource: 'approval_requests', decision: 'OKAY' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  describe("decide — DATA_RESTORE (reactivates the requesting Sakhi's account)", () => {
    function dataRestoreRequest(overrides: Partial<Record<string, unknown>> = {}) {
      return approvalRequest({
        requestType: 'DATA_RESTORE',
        reopenRequestId: null,
        beneficiaryId: null,
        requestedByUserId: '99999999-9999-9999-9999-999999999999',
        ...overrides,
      });
    }

    it('approves: reactivates the requesting Sakhi via UserClient and notifies', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockResolvedValue({
        id: card.requestedByUserId as string,
        status: 'ACTIVE',
      });

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        authHeader,
      );

      expect(userClient.reactivateUser).toHaveBeenCalledWith(card.requestedByUserId, authHeader);
      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'DATA_RESTORE_UPDATE',
        expect.any(String),
        expect.any(String),
        authHeader,
      );
      expect(result.decision).toBe('APPROVE');
    });

    it('rejects: makes no reactivation call, still notifies', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'REJECT' },
        authHeader,
      );

      expect(userClient.reactivateUser).not.toHaveBeenCalled();
      expect(notificationClient.notify).toHaveBeenCalled();
      expect(result.decision).toBe('REJECT');
    });

    it('rejects an invalid decision value', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'OKAY' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(userClient.reactivateUser).not.toHaveBeenCalled();
    });

    it('propagates a reactivation failure — NOT tolerated like the notification', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockRejectedValue(
        Object.assign(new Error('This user is already ACTIVE.'), { status: 409 }),
      );

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(notificationClient.notify).not.toHaveBeenCalled();
    });

    it('does not fail the request when notifying the Sakhi throws after reactivation succeeds', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockResolvedValue({
        id: card.requestedByUserId as string,
        status: 'ACTIVE',
      });
      notificationClient.notify.mockRejectedValue(
        Object.assign(new Error('Forbidden'), { status: 403 }),
      );

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        authHeader,
      );
      expect(result.decision).toBe('APPROVE');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('list — DATA_RESTORE is visible even though it has no decision path yet', () => {
    it('returns DATA_RESTORE alongside every other card type', async () => {
      lookupClient.resolveApprovalStatusId.mockResolvedValue(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      );
      repository.findMany.mockResolvedValue([
        approvalRequest({ id: 'card-restore', requestType: 'DATA_RESTORE' }),
        approvalRequest({ id: 'card-reopen', requestType: 'REOPEN' }),
        approvalRequest({ id: 'card-lmp', requestType: 'LMP_CHANGE' }),
        approvalRequest({ id: 'card-closure', requestType: 'CLOSURE_REVIEW' }),
        approvalRequest({ id: 'card-ref-inc', requestType: 'REFERRAL_INCOMPLETE' }),
        approvalRequest({ id: 'card-acc-ref', requestType: 'ACCOMPANIED_REFERRAL' }),
      ]);
      escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });

      const result = await service.list({ status: 'PENDING', limit: 50 }, authHeader);
      const types = result.cards.map((c) => c.cardType);

      expect(types).toEqual(
        expect.arrayContaining([
          'DATA_RESTORE',
          'REOPEN',
          'LMP_CHANGE',
          'CLOSURE_REVIEW',
          'REFERRAL_INCOMPLETE',
          'ACCOMPANIED_REFERRAL',
        ]),
      );
      expect(result.cards).toHaveLength(6);
    });
  });

  describe('decide — CLOSURE_REVIEW (approval_requests)', () => {
    function closureReviewRequest(overrides: Partial<Record<string, unknown>> = {}) {
      return approvalRequest({
        requestType: 'CLOSURE_REVIEW',
        reopenRequestId: null,
        closureId: '55555555-5555-5555-5555-555555555555',
        ...overrides,
      });
    }

    it('approves: decides via ClosureClient', async () => {
      const card = closureReviewRequest();
      repository.findById.mockResolvedValue(card);
      closureClient.decide.mockResolvedValue({
        id: card.closureId as unknown as string,
        beneficiaryId: card.beneficiaryId as string,
        supervisorStatus: 'APPROVED',
      });

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        authHeader,
      );

      expect(closureClient.decide).toHaveBeenCalledWith(
        card.closureId,
        'APPROVED',
        undefined,
        authHeader,
      );
      expect(result.decision).toBe('APPROVE');
    });

    it('rejects: decides via ClosureClient with REJECTED', async () => {
      const card = closureReviewRequest();
      repository.findById.mockResolvedValue(card);
      closureClient.decide.mockResolvedValue({
        id: card.closureId as unknown as string,
        beneficiaryId: card.beneficiaryId as string,
        supervisorStatus: 'REJECTED',
      });

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'REJECT' },
        authHeader,
      );
      expect(closureClient.decide).toHaveBeenCalledWith(
        card.closureId,
        'REJECTED',
        undefined,
        authHeader,
      );
      expect(result.decision).toBe('REJECT');
    });

    it('500s when the card has no linked closure', async () => {
      const card = closureReviewRequest({ closureId: null });
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 500 });
      expect(closureClient.decide).not.toHaveBeenCalled();
    });

    it('rejects an invalid decision value for a CLOSURE_REVIEW card', async () => {
      const card = closureReviewRequest();
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'OKAY' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(closureClient.decide).not.toHaveBeenCalled();
    });

    it('propagates a 409 from closure-reopen-service (already-decided closure)', async () => {
      const card = closureReviewRequest();
      repository.findById.mockResolvedValue(card);
      closureClient.decide.mockRejectedValue(
        Object.assign(new Error('Already decided'), { status: 409 }),
      );

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('decide — REFERRAL_INCOMPLETE (approval_requests)', () => {
    function referralIncompleteRequest(overrides: Partial<Record<string, unknown>> = {}) {
      return approvalRequest({
        requestType: 'REFERRAL_INCOMPLETE',
        reopenRequestId: null,
        referralId: '66666666-6666-6666-6666-666666666666',
        ...overrides,
      });
    }

    it('approves: decides via ReferralClient with LAPSE and notifies the Sakhi', async () => {
      const card = referralIncompleteRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockResolvedValue({
        id: card.referralId as unknown as string,
        beneficiaryId: card.beneficiaryId as string,
        status: 'LAPSED',
      });

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        authHeader,
      );

      expect(referralClient.decide).toHaveBeenCalledWith(card.referralId, 'LAPSE', authHeader);
      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'REFERRAL_INCOMPLETE_UPDATE',
        expect.any(String),
        expect.any(String),
        authHeader,
      );
      expect(result.decision).toBe('APPROVE');
    });

    it('rejects: decides via ReferralClient with REFILL', async () => {
      const card = referralIncompleteRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockResolvedValue({
        id: card.referralId as unknown as string,
        beneficiaryId: card.beneficiaryId as string,
        status: 'PENDING_FOLLOWUP',
      });

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'REJECT' },
        authHeader,
      );
      expect(referralClient.decide).toHaveBeenCalledWith(card.referralId, 'REFILL', authHeader);
      expect(result.decision).toBe('REJECT');
    });

    it('500s when the card has no linked referral', async () => {
      const card = referralIncompleteRequest({ referralId: null });
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 500 });
      expect(referralClient.decide).not.toHaveBeenCalled();
    });

    it('rejects an invalid decision value for a REFERRAL_INCOMPLETE card', async () => {
      const card = referralIncompleteRequest();
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'OKAY' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 400 });
      expect(referralClient.decide).not.toHaveBeenCalled();
    });

    it('propagates a 409 from risk-referral-service (referral not PENDING_FOLLOWUP)', async () => {
      const card = referralIncompleteRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockRejectedValue(
        Object.assign(new Error('Cannot decide'), { status: 409 }),
      );

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('does not fail the request when notifying the Sakhi throws after the decision is applied', async () => {
      const card = referralIncompleteRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockResolvedValue({
        id: card.referralId as unknown as string,
        beneficiaryId: card.beneficiaryId as string,
        status: 'LAPSED',
      });
      notificationClient.notify.mockRejectedValue(
        Object.assign(new Error('Forbidden'), { status: 403 }),
      );

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        authHeader,
      );
      expect(result.decision).toBe('APPROVE');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('decide — ACCOMPANIED_REFERRAL (approval_requests)', () => {
    function accompaniedReferralRequest(overrides: Partial<Record<string, unknown>> = {}) {
      return approvalRequest({
        requestType: 'ACCOMPANIED_REFERRAL',
        reopenRequestId: null,
        referralId: '77777777-7777-7777-7777-777777777777',
        ...overrides,
      });
    }

    it('approves: completes the referral, resolves the Sakhi, triggers the incentive, notifies', async () => {
      const card = accompaniedReferralRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockResolvedValue({
        id: card.referralId as unknown as string,
        beneficiaryId: card.beneficiaryId as string,
        status: 'COMPLETED',
      });
      beneficiaryClient.getById.mockResolvedValue({
        id: card.beneficiaryId as string,
        sakhiId: '88888888-8888-8888-8888-888888888888',
      });

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        authHeader,
      );

      expect(referralClient.decide).toHaveBeenCalledWith(card.referralId, 'COMPLETE', authHeader);
      expect(beneficiaryClient.getById).toHaveBeenCalledWith(card.beneficiaryId, authHeader);
      expect(incentiveClient.triggerAccompaniedReferral).toHaveBeenCalledWith(
        '88888888-8888-8888-8888-888888888888',
        card.referralId,
        authHeader,
      );
      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'ACCOMPANIED_REFERRAL_UPDATE',
        expect.any(String),
        expect.any(String),
        authHeader,
      );
      expect(result.decision).toBe('APPROVE');
    });

    it('rejects: makes no referral-side call, no incentive, still notifies', async () => {
      const card = accompaniedReferralRequest();
      repository.findById.mockResolvedValue(card);

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'REJECT' },
        authHeader,
      );

      expect(referralClient.decide).not.toHaveBeenCalled();
      expect(incentiveClient.triggerAccompaniedReferral).not.toHaveBeenCalled();
      expect(notificationClient.notify).toHaveBeenCalled();
      expect(result.decision).toBe('REJECT');
    });

    it('500s when the card has no linked referral', async () => {
      const card = accompaniedReferralRequest({ referralId: null });
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 500 });
      expect(referralClient.decide).not.toHaveBeenCalled();
    });

    it('rejects an invalid decision value', async () => {
      const card = accompaniedReferralRequest();
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'OKAY' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('propagates a referral decision failure without notifying or triggering an incentive', async () => {
      const card = accompaniedReferralRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockRejectedValue(
        Object.assign(new Error('Cannot decide'), { status: 409 }),
      );

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
      expect(incentiveClient.triggerAccompaniedReferral).not.toHaveBeenCalled();
      expect(notificationClient.notify).not.toHaveBeenCalled();
    });

    it('propagates a "no active rate" failure from the incentive trigger (not tolerated)', async () => {
      const card = accompaniedReferralRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockResolvedValue({
        id: card.referralId as unknown as string,
        beneficiaryId: card.beneficiaryId as string,
        status: 'COMPLETED',
      });
      beneficiaryClient.getById.mockResolvedValue({
        id: card.beneficiaryId as string,
        sakhiId: '88888888-8888-8888-8888-888888888888',
      });
      incentiveClient.triggerAccompaniedReferral.mockRejectedValue(
        Object.assign(new Error('No active incentive rate'), { status: 404 }),
      );

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(notificationClient.notify).not.toHaveBeenCalled();
    });

    it('404s when the linked beneficiary cannot be found', async () => {
      const card = accompaniedReferralRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockResolvedValue({
        id: card.referralId as unknown as string,
        beneficiaryId: card.beneficiaryId as string,
        status: 'COMPLETED',
      });
      beneficiaryClient.getById.mockResolvedValue(null);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(incentiveClient.triggerAccompaniedReferral).not.toHaveBeenCalled();
    });

    it('does not fail the request when notifying the Sakhi throws after approval is applied', async () => {
      const card = accompaniedReferralRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockResolvedValue({
        id: card.referralId as unknown as string,
        beneficiaryId: card.beneficiaryId as string,
        status: 'COMPLETED',
      });
      beneficiaryClient.getById.mockResolvedValue({
        id: card.beneficiaryId as string,
        sakhiId: '88888888-8888-8888-8888-888888888888',
      });
      notificationClient.notify.mockRejectedValue(
        Object.assign(new Error('Forbidden'), { status: 403 }),
      );

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        authHeader,
      );
      expect(result.decision).toBe('APPROVE');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('decide — LMP_CHANGE (approval_requests)', () => {
    function lmpChangeRequest(overrides: Partial<Record<string, unknown>> = {}) {
      return approvalRequest({
        requestType: 'LMP_CHANGE',
        reopenRequestId: null,
        requestPayloadJson: {
          newLmpDate: '2026-06-15',
          sonographyImageUrl: 'https://example.com/sonography-proof.jpg',
        },
        ...overrides,
      });
    }

    it('approves: applies the LMP change via BeneficiaryClient and notifies the Sakhi', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);
      beneficiaryClient.applyLmpChange.mockResolvedValue({ id: card.beneficiaryId as string });

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        authHeader,
      );

      expect(beneficiaryClient.applyLmpChange).toHaveBeenCalledWith(
        card.beneficiaryId,
        '2026-06-15',
        authHeader,
      );
      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'LMP_CHANGE_UPDATE',
        expect.any(String),
        expect.any(String),
        authHeader,
      );
      expect(result.decision).toBe('APPROVE');
    });

    it('rejects: does not call BeneficiaryClient, still notifies the Sakhi', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'REJECT' },
        authHeader,
      );

      expect(beneficiaryClient.applyLmpChange).not.toHaveBeenCalled();
      expect(notificationClient.notify).toHaveBeenCalled();
      expect(result.decision).toBe('REJECT');
    });

    it('422s on approve when requestPayloadJson has no valid newLmpDate', async () => {
      const card = lmpChangeRequest({ requestPayloadJson: { sonographyImageUrl: 'x' } });
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 422 });
      expect(beneficiaryClient.applyLmpChange).not.toHaveBeenCalled();
    });

    it('rejects an invalid decision value for an LMP_CHANGE card', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'OKAY' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    it('propagates a BeneficiaryClient failure on approve (not tolerated)', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);
      beneficiaryClient.applyLmpChange.mockRejectedValue(
        Object.assign(new Error('Bad gateway'), { status: 502 }),
      );

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 502 });
      expect(notificationClient.notify).not.toHaveBeenCalled();
    });

    it('does not fail the request when notifying the Sakhi throws after approval is applied', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);
      beneficiaryClient.applyLmpChange.mockResolvedValue({ id: card.beneficiaryId as string });
      notificationClient.notify.mockRejectedValue(
        Object.assign(new Error('Forbidden'), { status: 403 }),
      );

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        authHeader,
      );
      expect(result.decision).toBe('APPROVE');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });
});
