import { QuickResponseService } from './quick-response.service';
import type { QuickResponseRepository } from './quick-response.repository';
import type { LookupClient } from './lookup.client';
import type { EscalationClient } from './escalation.client';
import type { ReopenRequestClient } from './reopen-request.client';
import type { BeneficiaryClient } from './beneficiary.client';
import type { NotificationClient } from './notification.client';
import type { AuditClient } from './audit.client';
import type { ClosureClient } from './closure.client';
import type { ReferralClient } from './referral.client';
import type { IncentiveClient } from './incentive.client';
import type { UserClient } from './user.client';
import type { SakhiClient } from './sakhi.client';
import type { GeographyClient } from './geography.client';
import type { VisitClient } from './visit.client';

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
    localRequestUuid: null,
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
    markDecided: jest.fn(),
  } as unknown as jest.Mocked<QuickResponseRepository>;
  const lookupClient = {
    resolveApprovalStatusId: jest.fn(),
    resolveApprovalStatusCode: jest.fn(),
  } as unknown as jest.Mocked<LookupClient>;
  const escalationClient = {
    list: jest.fn(),
    findById: jest.fn(),
    acknowledgeEddNearing: jest.fn(),
    decideMissedVisit: jest.fn(),
  } as unknown as jest.Mocked<EscalationClient>;
  const reopenRequestClient = {
    decide: jest.fn(),
    getDecisionStatusByIds: jest.fn(),
    getById: jest.fn(),
  } as unknown as jest.Mocked<ReopenRequestClient>;
  const beneficiaryClient = {
    applyLmpChange: jest.fn(),
    getById: jest.fn(),
    getManyWithRisk: jest.fn(),
    restoreForSakhi: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  const notificationClient = { notify: jest.fn() } as unknown as jest.Mocked<NotificationClient>;
  const closureClient = {
    decide: jest.fn(),
    getDecisionStatusByIds: jest.fn(),
    getById: jest.fn(),
  } as unknown as jest.Mocked<ClosureClient>;
  const referralClient = {
    decide: jest.fn(),
    getDecisionStatusByIds: jest.fn(),
    getById: jest.fn(),
  } as unknown as jest.Mocked<ReferralClient>;
  const incentiveClient = {
    triggerAccompaniedReferral: jest.fn(),
  } as unknown as jest.Mocked<IncentiveClient>;
  const userClient = { reactivateUser: jest.fn() } as unknown as jest.Mocked<UserClient>;
  const sakhiClient = {
    getById: jest.fn(),
    getManyByIds: jest.fn(),
    getOwnSakhiIds: jest.fn(),
  } as unknown as jest.Mocked<SakhiClient>;
  const geographyClient = { getById: jest.fn() } as unknown as jest.Mocked<GeographyClient>;
  const visitClient = {
    getById: jest.fn(),
    restoreForSakhi: jest.fn(),
  } as unknown as jest.Mocked<VisitClient>;
  const auditClient = { log: jest.fn() } as unknown as jest.Mocked<AuditClient>;
  let service: QuickResponseService;
  const authHeader = 'Bearer token';
  let consoleErrorSpy: jest.SpyInstance;

  const managerCaller = { id: 'manager-1', roles: ['MANAGER'], projectId: null };
  const supervisorCaller = (projectId: string | null, id = 'supervisor-1') => ({
    id,
    roles: ['SUPERVISOR'],
    projectId,
  });

  const DECIDED_BY_USER_ID = '55555555-5555-5555-5555-555555555555';
  // MANAGER (privileged) so the roster-ownership check decide() now applies
  // never gates these dispatch-focused tests — they exercise per-card-type
  // decision behavior, not authorization, which has its own describe block.
  const decidedByCaller = { id: DECIDED_BY_USER_ID, roles: ['MANAGER'], projectId: null };

  beforeEach(() => {
    jest.resetAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    // Default so every decide() test's post-side-effect markDecided call
    // resolves a real lookup id rather than hitting the "no lookup value
    // found" log branch — tests asserting list()'s own filtering override
    // this per-call as needed.
    lookupClient.resolveApprovalStatusId.mockResolvedValue('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
    repository.markDecided.mockResolvedValue(true);
    // Default every list()-reconciliation batch call to echo "still
    // pending" for whatever ids it's asked about, so existing list() tests
    // that don't care about reconciliation see unfiltered results — tests
    // asserting filterStillPending's own behavior override these per-call.
    closureClient.getDecisionStatusByIds.mockImplementation(
      async (ids: string[]) => new Map(ids.map((id) => [id, 'PENDING'])),
    );
    reopenRequestClient.getDecisionStatusByIds.mockImplementation(
      async (ids: string[]) => new Map(ids.map((id) => [id, 'PENDING'])),
    );
    referralClient.getDecisionStatusByIds.mockImplementation(
      async (ids: string[]) => new Map(ids.map((id) => [id, 'PENDING_FOLLOWUP'])),
    );
    // Default so list() tests that don't care about name enrichment aren't
    // affected by it — tests asserting the batch-enrichment behavior itself
    // override these per-call.
    beneficiaryClient.getManyWithRisk.mockResolvedValue(new Map());
    sakhiClient.getManyByIds.mockResolvedValue(new Map());
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
      sakhiClient,
      geographyClient,
      visitClient,
      auditClient,
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

      const result = await service.list(
        { status: 'PENDING', limit: 50 },
        managerCaller,
        authHeader,
      );
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

      await service.list({ status: 'PENDING', limit: 50 }, managerCaller, authHeader);
      expect(escalationClient.list).toHaveBeenCalledWith('OPEN', undefined, 50, authHeader);
    });

    it('skips the escalation-events call entirely for a non-PENDING status', async () => {
      lookupClient.resolveApprovalStatusId.mockResolvedValue(
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      );
      repository.findMany.mockResolvedValue([]);

      const result = await service.list(
        { status: 'APPROVED', limit: 50 },
        managerCaller,
        authHeader,
      );
      expect(escalationClient.list).not.toHaveBeenCalled();
      expect(result.cards).toHaveLength(0);
    });

    it('returns an empty list when the APPROVAL_STATUS lookup value is unknown', async () => {
      lookupClient.resolveApprovalStatusId.mockResolvedValue(null);
      escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });

      const result = await service.list({ status: 'BOGUS', limit: 50 }, managerCaller, authHeader);
      expect(result.cards).toHaveLength(0);
      expect(repository.findMany).not.toHaveBeenCalled();
    });

    it('rejects a malformed cursor with a 400', async () => {
      await expect(
        service.list(
          { status: 'PENDING', cursor: 'not-valid!!', limit: 50 },
          managerCaller,
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 400 });
    });

    describe('batch-enriching approval_requests cards with names', () => {
      it('populates beneficiaryName and sakhiName for approval cards on the page', async () => {
        repository.findMany.mockResolvedValue([approvalRequest()]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });
        beneficiaryClient.getManyWithRisk.mockResolvedValue(
          new Map([['22222222-2222-2222-2222-222222222222', 'Sita Kumari']]),
        );
        sakhiClient.getManyByIds.mockResolvedValue(
          new Map([['44444444-4444-4444-4444-444444444444', 'Asha Devi']]),
        );

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          managerCaller,
          authHeader,
        );
        expect(result.cards[0]).toMatchObject({
          beneficiaryName: 'Sita Kumari',
          sakhiName: 'Asha Devi',
        });
      });

      it('leaves escalation cards unenriched (no beneficiaryName/sakhiName fields added)', async () => {
        repository.findMany.mockResolvedValue([]);
        escalationClient.list.mockResolvedValue({ cards: [escalationCard()], nextCursor: null });

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          managerCaller,
          authHeader,
        );
        expect(result.cards[0]).not.toHaveProperty('beneficiaryName');
        expect(result.cards[0]).not.toHaveProperty('sakhiName');
      });

      it('calls getManyWithRisk once with a deduped beneficiaryId list', async () => {
        repository.findMany.mockResolvedValue([
          approvalRequest({ id: 'card-1' }),
          approvalRequest({ id: 'card-2' }),
        ]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });

        await service.list({ status: 'PENDING', limit: 50 }, managerCaller, authHeader);

        expect(beneficiaryClient.getManyWithRisk).toHaveBeenCalledTimes(1);
        expect(beneficiaryClient.getManyWithRisk).toHaveBeenCalledWith(
          ['22222222-2222-2222-2222-222222222222'],
          authHeader,
        );
      });

      it('calls sakhiClient.getManyByIds once with a deduped requestedByUserId list, not once per row', async () => {
        repository.findMany.mockResolvedValue([
          approvalRequest({ id: 'card-1' }),
          approvalRequest({ id: 'card-2' }),
        ]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });

        await service.list({ status: 'PENDING', limit: 50 }, managerCaller, authHeader);

        expect(sakhiClient.getManyByIds).toHaveBeenCalledTimes(1);
        expect(sakhiClient.getManyByIds).toHaveBeenCalledWith(
          ['44444444-4444-4444-4444-444444444444'],
          authHeader,
        );
      });

      it('resolves DATA_RESTORE sakhiName from requestedByUserId', async () => {
        repository.findMany.mockResolvedValue([
          approvalRequest({ requestType: 'DATA_RESTORE', beneficiaryId: null }),
        ]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });
        sakhiClient.getManyByIds.mockResolvedValue(
          new Map([['44444444-4444-4444-4444-444444444444', 'Meena Kumari']]),
        );

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          managerCaller,
          authHeader,
        );
        expect(result.cards[0]).toMatchObject({ sakhiName: 'Meena Kumari', beneficiaryName: null });
      });

      it('sets beneficiaryName to null and excludes the row from the batch call when beneficiaryId is absent', async () => {
        repository.findMany.mockResolvedValue([
          approvalRequest({ requestType: 'DATA_RESTORE', beneficiaryId: null }),
        ]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          managerCaller,
          authHeader,
        );
        expect(result.cards[0]).toMatchObject({ beneficiaryName: null });
        expect(beneficiaryClient.getManyWithRisk).not.toHaveBeenCalled();
      });

      it('skips both batch lookups entirely when the page has no approval_requests cards', async () => {
        repository.findMany.mockResolvedValue([]);
        escalationClient.list.mockResolvedValue({ cards: [escalationCard()], nextCursor: null });

        await service.list({ status: 'PENDING', limit: 50 }, managerCaller, authHeader);

        expect(beneficiaryClient.getManyWithRisk).not.toHaveBeenCalled();
        expect(sakhiClient.getManyByIds).not.toHaveBeenCalled();
      });

      it('degrades beneficiaryName to null for the whole page, without failing list(), when the batch call throws', async () => {
        repository.findMany.mockResolvedValue([approvalRequest()]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });
        beneficiaryClient.getManyWithRisk.mockRejectedValue(new Error('beneficiary-service down'));

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          managerCaller,
          authHeader,
        );
        expect(result.cards[0]).toMatchObject({ beneficiaryName: null });
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it('degrades sakhiName to null for the whole page, without failing list(), when the batch call throws', async () => {
        repository.findMany.mockResolvedValue([approvalRequest()]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });
        sakhiClient.getManyByIds.mockRejectedValue(new Error('auth-service unreachable'));

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          managerCaller,
          authHeader,
        );
        expect(result.cards[0]).toMatchObject({ sakhiName: null });
        expect(consoleErrorSpy).toHaveBeenCalled();
      });
    });

    describe('reconciling stale PENDING cards against their backing resource', () => {
      it('excludes a CLOSURE_REVIEW card whose closure was already decided directly', async () => {
        repository.findMany.mockResolvedValue([
          approvalRequest({ requestType: 'CLOSURE_REVIEW', closureId: 'closure-1' }),
        ]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });
        closureClient.getDecisionStatusByIds.mockResolvedValue(
          new Map([['closure-1', 'APPROVED']]),
        );

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          managerCaller,
          authHeader,
        );
        expect(result.cards).toHaveLength(0);
      });

      it('excludes a REOPEN card whose reopen request was already decided directly', async () => {
        repository.findMany.mockResolvedValue([
          approvalRequest({ requestType: 'REOPEN', reopenRequestId: 'reopen-1' }),
        ]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });
        reopenRequestClient.getDecisionStatusByIds.mockResolvedValue(
          new Map([['reopen-1', 'REJECTED']]),
        );

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          managerCaller,
          authHeader,
        );
        expect(result.cards).toHaveLength(0);
      });

      it.each(['REFERRAL_INCOMPLETE', 'ACCOMPANIED_REFERRAL'])(
        'excludes a %s card whose referral is no longer PENDING_FOLLOWUP',
        async (requestType) => {
          repository.findMany.mockResolvedValue([
            approvalRequest({ requestType, referralId: 'referral-1' }),
          ]);
          escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });
          referralClient.getDecisionStatusByIds.mockResolvedValue(
            new Map([['referral-1', 'COMPLETED']]),
          );

          const result = await service.list(
            { status: 'PENDING', limit: 50 },
            managerCaller,
            authHeader,
          );
          expect(result.cards).toHaveLength(0);
        },
      );

      it('never calls any reconciliation client for LMP_CHANGE or DATA_RESTORE cards', async () => {
        repository.findMany.mockResolvedValue([
          approvalRequest({
            id: 'card-lmp',
            requestType: 'LMP_CHANGE',
            reopenRequestId: null,
          }),
          approvalRequest({
            id: 'card-restore',
            requestType: 'DATA_RESTORE',
            reopenRequestId: null,
          }),
        ]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          managerCaller,
          authHeader,
        );

        expect(result.cards).toHaveLength(2);
        expect(closureClient.getDecisionStatusByIds).not.toHaveBeenCalled();
        expect(reopenRequestClient.getDecisionStatusByIds).not.toHaveBeenCalled();
        expect(referralClient.getDecisionStatusByIds).not.toHaveBeenCalled();
      });

      it('treats an id absent from the batch response as no longer pending', async () => {
        repository.findMany.mockResolvedValue([
          approvalRequest({ requestType: 'CLOSURE_REVIEW', closureId: 'closure-deleted' }),
        ]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });
        // The batch call succeeds but doesn't include this id at all (e.g.
        // the closure was soft-deleted) — absence, not an explicit status,
        // is still "not pending".
        closureClient.getDecisionStatusByIds.mockResolvedValue(new Map());

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          managerCaller,
          authHeader,
        );
        expect(result.cards).toHaveLength(0);
      });

      it('skips reconciliation entirely for a non-PENDING status query', async () => {
        repository.findMany.mockResolvedValue([
          approvalRequest({ requestType: 'CLOSURE_REVIEW', closureId: 'closure-1' }),
        ]);

        const result = await service.list(
          { status: 'APPROVED', limit: 50 },
          managerCaller,
          authHeader,
        );

        expect(result.cards).toHaveLength(1);
        expect(closureClient.getDecisionStatusByIds).not.toHaveBeenCalled();
      });

      it('fails open for a group whose batch call rejects, while still reconciling the other groups', async () => {
        repository.findMany.mockResolvedValue([
          approvalRequest({
            id: 'card-closure',
            requestType: 'CLOSURE_REVIEW',
            closureId: 'closure-1',
            reopenRequestId: null,
          }),
          approvalRequest({
            id: 'card-reopen',
            requestType: 'REOPEN',
            reopenRequestId: 'reopen-1',
          }),
        ]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });
        closureClient.getDecisionStatusByIds.mockRejectedValue(new Error('network error'));
        reopenRequestClient.getDecisionStatusByIds.mockResolvedValue(
          new Map([['reopen-1', 'APPROVED']]),
        );

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          managerCaller,
          authHeader,
        );

        // closure group failed -> passes through un-reconciled (still shown);
        // reopen group succeeded and found it decided -> excluded.
        expect(result.cards.map((c) => c.cardId)).toEqual(['card-closure']);
        expect(consoleErrorSpy).toHaveBeenCalled();
      });

      it('batches all ids of the same type into a single call, not one per row', async () => {
        repository.findMany.mockResolvedValue([
          approvalRequest({
            id: 'card-closure-a',
            requestType: 'CLOSURE_REVIEW',
            closureId: 'closure-a',
            reopenRequestId: null,
          }),
          approvalRequest({
            id: 'card-closure-b',
            requestType: 'CLOSURE_REVIEW',
            closureId: 'closure-b',
            reopenRequestId: null,
          }),
        ]);
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });

        await service.list({ status: 'PENDING', limit: 50 }, managerCaller, authHeader);

        expect(closureClient.getDecisionStatusByIds).toHaveBeenCalledTimes(1);
        expect(closureClient.getDecisionStatusByIds).toHaveBeenCalledWith(
          ['closure-a', 'closure-b'],
          authHeader,
        );
      });
    });

    describe('supervisor scoping', () => {
      beforeEach(() => {
        escalationClient.list.mockResolvedValue({ cards: [], nextCursor: null });
      });

      it("scopes a SUPERVISOR caller's approval_requests to their own resolved Sakhi ids", async () => {
        sakhiClient.getOwnSakhiIds.mockResolvedValue(['sakhi-1', 'sakhi-2']);
        repository.findMany.mockResolvedValue([]);

        await service.list(
          { status: 'PENDING', limit: 50 },
          supervisorCaller('project-1'),
          authHeader,
        );

        expect(sakhiClient.getOwnSakhiIds).toHaveBeenCalledWith('project-1', authHeader);
        expect(repository.findMany).toHaveBeenCalledWith(
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          50,
          null,
          ['sakhi-1', 'sakhi-2'],
        );
      });

      it('returns an empty approval_requests page (not an error) for a SUPERVISOR with zero assigned Sakhis', async () => {
        sakhiClient.getOwnSakhiIds.mockResolvedValue([]);
        repository.findMany.mockResolvedValue([]);

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          supervisorCaller('project-1'),
          authHeader,
        );

        expect(repository.findMany).toHaveBeenCalledWith(expect.any(String), 50, null, []);
        expect(result.cards).toEqual([]);
      });

      it('does not restrict a MANAGER/ADMIN caller — repository is called with sakhiIds: null, no auth-service lookup made', async () => {
        repository.findMany.mockResolvedValue([]);

        await service.list({ status: 'PENDING', limit: 50 }, managerCaller, authHeader);

        expect(sakhiClient.getOwnSakhiIds).not.toHaveBeenCalled();
        expect(repository.findMany).toHaveBeenCalledWith(expect.any(String), 50, null, null);
      });

      it('fails closed to zero accessible Sakhis for a SUPERVISOR caller with no projectId on their scope', async () => {
        repository.findMany.mockResolvedValue([]);

        await service.list({ status: 'PENDING', limit: 50 }, supervisorCaller(null), authHeader);

        expect(sakhiClient.getOwnSakhiIds).not.toHaveBeenCalled();
        expect(repository.findMany).toHaveBeenCalledWith(expect.any(String), 50, null, []);
      });

      it('fails closed to zero accessible Sakhis (not a 500) when auth-service errors resolving the roster', async () => {
        sakhiClient.getOwnSakhiIds.mockRejectedValue(new Error('auth-service unreachable'));
        repository.findMany.mockResolvedValue([]);

        const result = await service.list(
          { status: 'PENDING', limit: 50 },
          supervisorCaller('project-1'),
          authHeader,
        );

        expect(repository.findMany).toHaveBeenCalledWith(expect.any(String), 50, null, []);
        expect(result.cards).toEqual([]);
        expect(consoleErrorSpy).toHaveBeenCalled();
      });
    });
  });

  describe('getCardDetail', () => {
    function fullBeneficiary(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: '22222222-2222-2222-2222-222222222222',
        sakhiId: '88888888-8888-8888-8888-888888888888',
        pii: { fullName: 'Asha Devi', padaId: '99999999-9999-9999-9999-999999999999' },
        motherCaseDetails: {
          lmpDate: '2026-01-01T00:00:00.000Z',
          eddDate: '2026-10-08T00:00:00.000Z',
        },
        riskConditionSummaries: [
          {
            riskConditionId: 'risk-1',
            phase: 'ANC',
            latestGrade: 'HIGH',
            latestAssessedAt: '2026-07-01T00:00:00.000Z',
            everHighestGrade: 'HIGH',
            everAtRiskFlag: true,
            currentReferralTriggerFlag: false,
            currentHrVisitTriggerFlag: true,
          },
        ],
        ...overrides,
      };
    }

    beforeEach(() => {
      sakhiClient.getById.mockResolvedValue({
        supervisorId: null,
        sakhiId: '88888888-8888-8888-8888-888888888888',
        displayName: 'Priya Sharma',
        mobileNumber: '+919000000123',
      });
      geographyClient.getById.mockResolvedValue({
        geographyUnitId: '99999999-9999-9999-9999-999999999999',
        name: 'Sundarpada',
        geoType: 'PADA',
      });
      beneficiaryClient.getById.mockResolvedValue(fullBeneficiary());
    });

    it('404s when the cardId matches neither approval_requests nor escalation_events', async () => {
      repository.findById.mockResolvedValue(null);
      escalationClient.findById.mockResolvedValue(null);

      await expect(
        service.getCardDetail('11111111-1111-1111-1111-111111111111', managerCaller, authHeader),
      ).rejects.toMatchObject({ status: 404 });
    });

    describe('supervisor scoping', () => {
      it("returns the card when the raising Sakhi is in the SUPERVISOR caller's own roster", async () => {
        sakhiClient.getOwnSakhiIds.mockResolvedValue(['44444444-4444-4444-4444-444444444444']);
        repository.findById.mockResolvedValue(
          approvalRequest({ requestType: 'REOPEN', reopenRequestId: 'reopen-1' }),
        );
        reopenRequestClient.getById.mockResolvedValue({
          id: 'reopen-1',
          beneficiaryId: '22222222-2222-2222-2222-222222222222',
          supervisorStatus: 'PENDING',
          requestReason: 'CLOSED_BY_MISTAKE',
          decisionNotes: null,
        });

        const result = await service.getCardDetail(
          '11111111-1111-1111-1111-111111111111',
          supervisorCaller('project-1'),
          authHeader,
        );

        expect(result).toMatchObject({ reasonForReopen: 'CLOSED_BY_MISTAKE' });
      });

      it("rejects with 403 when the raising Sakhi is outside the SUPERVISOR caller's own roster, without calling any downstream enrichment client", async () => {
        sakhiClient.getOwnSakhiIds.mockResolvedValue(['some-other-sakhi']);
        repository.findById.mockResolvedValue(
          approvalRequest({ requestType: 'REOPEN', reopenRequestId: 'reopen-1' }),
        );

        await expect(
          service.getCardDetail(
            '11111111-1111-1111-1111-111111111111',
            supervisorCaller('project-1'),
            authHeader,
          ),
        ).rejects.toMatchObject({ status: 403 });
        expect(beneficiaryClient.getById).not.toHaveBeenCalled();
        expect(reopenRequestClient.getById).not.toHaveBeenCalled();
      });

      it('does not restrict a MANAGER/ADMIN caller — no auth-service roster lookup is made', async () => {
        repository.findById.mockResolvedValue(
          approvalRequest({ requestType: 'REOPEN', reopenRequestId: 'reopen-1' }),
        );
        reopenRequestClient.getById.mockResolvedValue({
          id: 'reopen-1',
          beneficiaryId: '22222222-2222-2222-2222-222222222222',
          supervisorStatus: 'PENDING',
          requestReason: 'CLOSED_BY_MISTAKE',
          decisionNotes: null,
        });

        await service.getCardDetail(
          '11111111-1111-1111-1111-111111111111',
          managerCaller,
          authHeader,
        );

        expect(sakhiClient.getOwnSakhiIds).not.toHaveBeenCalled();
      });

      it('fails closed (403) for a SUPERVISOR caller with no projectId on their scope', async () => {
        repository.findById.mockResolvedValue(
          approvalRequest({ requestType: 'REOPEN', reopenRequestId: 'reopen-1' }),
        );

        await expect(
          service.getCardDetail(
            '11111111-1111-1111-1111-111111111111',
            supervisorCaller(null),
            authHeader,
          ),
        ).rejects.toMatchObject({ status: 403 });
        expect(sakhiClient.getOwnSakhiIds).not.toHaveBeenCalled();
      });

      it('fails closed (403, not 500) when auth-service errors resolving the roster', async () => {
        sakhiClient.getOwnSakhiIds.mockRejectedValue(new Error('auth-service unreachable'));
        repository.findById.mockResolvedValue(
          approvalRequest({ requestType: 'REOPEN', reopenRequestId: 'reopen-1' }),
        );

        await expect(
          service.getCardDetail(
            '11111111-1111-1111-1111-111111111111',
            supervisorCaller('project-1'),
            authHeader,
          ),
        ).rejects.toMatchObject({ status: 403 });
        expect(reopenRequestClient.getById).not.toHaveBeenCalled();
      });
    });

    it('LMP_CHANGE: returns names, old/new LMP, risk/contact, and null sonography asset id when absent', async () => {
      repository.findById.mockResolvedValue(
        approvalRequest({
          requestType: 'LMP_CHANGE',
          reopenRequestId: null,
          requestPayloadJson: { newLmpDate: '2026-02-01' },
        }),
      );

      const result = await service.getCardDetail(
        '11111111-1111-1111-1111-111111111111',
        managerCaller,
        authHeader,
      );

      expect(result).toMatchObject({
        padaName: 'Sundarpada',
        sakhiName: 'Priya Sharma',
        beneficiaryName: 'Asha Devi',
        oldLmpDate: '2026-01-01T00:00:00.000Z',
        newLmpDate: '2026-02-01',
        sonographyImageAssetId: null,
        sakhiContactNumber: '+919000000123',
      });
      expect((result as unknown as { riskDetails: unknown[] }).riskDetails).toHaveLength(1);
    });

    it('LMP_CHANGE: returns the sonography asset id when the payload carries one', async () => {
      repository.findById.mockResolvedValue(
        approvalRequest({
          requestType: 'LMP_CHANGE',
          reopenRequestId: null,
          requestPayloadJson: {
            newLmpDate: '2026-02-01',
            sonographyImageAssetId: 'aaaaaaaa-1111-1111-1111-111111111111',
          },
        }),
      );

      const result = await service.getCardDetail(
        '11111111-1111-1111-1111-111111111111',
        managerCaller,
        authHeader,
      );

      expect(result).toMatchObject({
        sonographyImageAssetId: 'aaaaaaaa-1111-1111-1111-111111111111',
      });
    });

    describe('getLmpChangeRequestDetail', () => {
      it('returns the dedicated LMP change request shape', async () => {
        repository.findById.mockResolvedValue(
          approvalRequest({
            requestType: 'LMP_CHANGE',
            reopenRequestId: null,
            requestPayloadJson: {
              newLmpDate: '2026-02-01',
              sonographyImageAssetId: 'aaaaaaaa-1111-1111-1111-111111111111',
            },
          }),
        );
        lookupClient.resolveApprovalStatusCode.mockResolvedValue('PENDING');

        const result = await service.getLmpChangeRequestDetail(
          '11111111-1111-1111-1111-111111111111',
          authHeader,
        );

        expect(result).toEqual({
          id: '11111111-1111-1111-1111-111111111111',
          beneficiaryId: '22222222-2222-2222-2222-222222222222',
          oldLmpDate: '2026-01-01T00:00:00.000Z',
          newLmpDate: '2026-02-01',
          sonographyImageAssetId: 'aaaaaaaa-1111-1111-1111-111111111111',
          requestedByUserId: '44444444-4444-4444-4444-444444444444',
          requestedAt: '2026-08-05T10:00:00.000Z',
          supervisorStatus: 'PENDING',
        });
        expect(lookupClient.resolveApprovalStatusCode).toHaveBeenCalledWith(
          'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
          authHeader,
        );
      });

      it('404s when the id does not exist', async () => {
        repository.findById.mockResolvedValue(null);

        await expect(
          service.getLmpChangeRequestDetail('11111111-1111-1111-1111-111111111111', authHeader),
        ).rejects.toMatchObject({ status: 404 });
      });

      it('404s when the id belongs to a different card type — never leaks another type under this URL', async () => {
        repository.findById.mockResolvedValue(approvalRequest({ requestType: 'REOPEN' }));

        await expect(
          service.getLmpChangeRequestDetail('11111111-1111-1111-1111-111111111111', authHeader),
        ).rejects.toMatchObject({ status: 404 });
      });

      it('500s when the row has no linked beneficiary — data integrity issue, not a client error', async () => {
        repository.findById.mockResolvedValue(
          approvalRequest({ requestType: 'LMP_CHANGE', beneficiaryId: null }),
        );

        await expect(
          service.getLmpChangeRequestDetail('11111111-1111-1111-1111-111111111111', authHeader),
        ).rejects.toMatchObject({ status: 500 });
      });

      it('resolves supervisorStatus to null (fail-open) when the lookup cannot be resolved', async () => {
        repository.findById.mockResolvedValue(
          approvalRequest({ requestType: 'LMP_CHANGE', requestPayloadJson: null }),
        );
        lookupClient.resolveApprovalStatusCode.mockResolvedValue(null);

        const result = await service.getLmpChangeRequestDetail(
          '11111111-1111-1111-1111-111111111111',
          authHeader,
        );

        expect(result).toMatchObject({ supervisorStatus: null, newLmpDate: null });
      });
    });

    it('CLOSURE_REVIEW: returns closure fields, names, supervisor notes, risk details, and contact number', async () => {
      repository.findById.mockResolvedValue(
        approvalRequest({
          requestType: 'CLOSURE_REVIEW',
          reopenRequestId: null,
          closureId: 'closure-1',
        }),
      );
      closureClient.getById.mockResolvedValue({
        id: 'closure-1',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        supervisorStatus: 'PENDING',
        closureType: 'MEDICAL',
        closureReasonLookupValueId: 'reason-1',
        closureDate: '2026-08-01T00:00:00.000Z',
        supervisorNotes: 'Beneficiary relocated.',
      });

      const result = await service.getCardDetail(
        '11111111-1111-1111-1111-111111111111',
        managerCaller,
        authHeader,
      );

      expect(result).toMatchObject({
        padaName: 'Sundarpada',
        sakhiName: 'Priya Sharma',
        beneficiaryName: 'Asha Devi',
        closureType: 'MEDICAL',
        closureReasonLookupValueId: 'reason-1',
        supervisorNotes: 'Beneficiary relocated.',
        sakhiContactNumber: '+919000000123',
      });
      expect(closureClient.getById).toHaveBeenCalledWith('closure-1', authHeader);
      expect((result as unknown as { riskDetails: unknown[] }).riskDetails).toHaveLength(1);
    });

    it('REOPEN: returns reason for reopen, risk details, and contact number', async () => {
      repository.findById.mockResolvedValue(
        approvalRequest({ requestType: 'REOPEN', reopenRequestId: 'reopen-1' }),
      );
      reopenRequestClient.getById.mockResolvedValue({
        id: 'reopen-1',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        supervisorStatus: 'PENDING',
        requestReason: 'CLOSED_BY_MISTAKE',
        decisionNotes: null,
      });

      const result = await service.getCardDetail(
        '11111111-1111-1111-1111-111111111111',
        managerCaller,
        authHeader,
      );

      expect(result).toMatchObject({
        padaName: 'Sundarpada',
        sakhiName: 'Priya Sharma',
        beneficiaryName: 'Asha Devi',
        reasonForReopen: 'CLOSED_BY_MISTAKE',
        sakhiContactNumber: '+919000000123',
      });
      expect((result as unknown as { riskDetails: unknown[] }).riskDetails).toHaveLength(1);
    });

    it('ACCOMPANIED_REFERRAL: returns referral details, risk/contact, and null photo evidence when absent', async () => {
      repository.findById.mockResolvedValue(
        approvalRequest({
          requestType: 'ACCOMPANIED_REFERRAL',
          reopenRequestId: null,
          referralId: 'referral-1',
        }),
      );
      referralClient.getById.mockResolvedValue({
        id: 'referral-1',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        status: 'PENDING_FOLLOWUP',
        visitId: null,
        referralDate: '2026-07-01T00:00:00.000Z',
        facilityType: 'PHC',
        facilityName: 'Sample PHC',
        photoEvidenceMediaAssetId: null,
        incompleteCount: 0,
        latestFollowup: null,
      });

      const result = await service.getCardDetail(
        '11111111-1111-1111-1111-111111111111',
        managerCaller,
        authHeader,
      );

      expect(result).toMatchObject({
        referralDate: '2026-07-01T00:00:00.000Z',
        facilityType: 'PHC',
        facilityName: 'Sample PHC',
        photoEvidenceAssetId: null,
        sakhiContactNumber: '+919000000123',
      });
      expect((result as unknown as { riskDetails: unknown[] }).riskDetails).toHaveLength(1);
    });

    it('ACCOMPANIED_REFERRAL: returns the photo evidence asset id when the referral carries one', async () => {
      repository.findById.mockResolvedValue(
        approvalRequest({
          requestType: 'ACCOMPANIED_REFERRAL',
          reopenRequestId: null,
          referralId: 'referral-1',
        }),
      );
      referralClient.getById.mockResolvedValue({
        id: 'referral-1',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        status: 'PENDING_FOLLOWUP',
        visitId: null,
        referralDate: '2026-07-01T00:00:00.000Z',
        facilityType: 'PHC',
        facilityName: 'Sample PHC',
        photoEvidenceMediaAssetId: 'bbbbbbbb-2222-2222-2222-222222222222',
        incompleteCount: 0,
        latestFollowup: null,
      });

      const result = await service.getCardDetail(
        '11111111-1111-1111-1111-111111111111',
        managerCaller,
        authHeader,
      );

      expect(result).toMatchObject({
        photoEvidenceAssetId: 'bbbbbbbb-2222-2222-2222-222222222222',
      });
    });

    it('MISSED_VISIT_ESCALATION: returns visit type label, no #-visits-missed field', async () => {
      repository.findById.mockResolvedValue(null);
      escalationClient.findById.mockResolvedValue({
        cardId: '66666666-6666-6666-6666-666666666666',
        cardType: 'MISSED_VISIT',
        cardSource: 'escalation_events',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        visitId: null,
        referralId: null,
        escalationType: 'ANC_2_MISSED',
        status: 'OPEN',
        raisedAt: '2026-08-05T11:00:00.000Z',
      });

      const result = await service.getCardDetail(
        '66666666-6666-6666-6666-666666666666',
        managerCaller,
        authHeader,
      );

      expect(result).toMatchObject({
        sakhiName: 'Priya Sharma',
        beneficiaryName: 'Asha Devi',
        visitType: 'ANC_2_MISSED',
        sakhiContactNumber: '+919000000123',
      });
      expect(result).not.toHaveProperty('visitsMissedCount');
    });

    it('REFERRAL_INCOMPLETE: returns visit reference, referrals-missed count, and reason', async () => {
      repository.findById.mockResolvedValue(
        approvalRequest({
          requestType: 'REFERRAL_INCOMPLETE',
          reopenRequestId: null,
          referralId: 'referral-1',
        }),
      );
      referralClient.getById.mockResolvedValue({
        id: 'referral-1',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        status: 'PENDING_FOLLOWUP',
        visitId: 'visit-1',
        referralDate: '2026-07-01T00:00:00.000Z',
        facilityType: null,
        facilityName: null,
        photoEvidenceMediaAssetId: null,
        incompleteCount: 2,
        latestFollowup: {
          followupDate: '2026-07-15T00:00:00.000Z',
          notVisitedReason: 'Beneficiary unavailable',
          outcome: null,
        },
      });
      visitClient.getById.mockResolvedValue({
        id: 'visit-1',
        scheduleId: 'schedule-1',
        actualVisitDate: null,
        statusLookupValueId: 'status-1',
      });

      const result = await service.getCardDetail(
        '11111111-1111-1111-1111-111111111111',
        managerCaller,
        authHeader,
      );

      expect(result).toMatchObject({
        referralsMissedCount: 2,
        reason: 'Beneficiary unavailable',
      });
      expect((result as unknown as { visitReference: unknown }).visitReference).toMatchObject({
        id: 'visit-1',
      });
    });

    describe('concurrency: resolveCommonFields runs alongside the card-type resource fetch', () => {
      /** Blocks beneficiaryClient.getById until releaseBeneficiary() is called,
       * so tests can prove the other fetch was already dispatched before the
       * beneficiary lookup resolved. */
      function deferBeneficiaryLookup() {
        let releaseBeneficiary!: () => void;
        const gate = new Promise<void>((resolve) => {
          releaseBeneficiary = resolve;
        });
        beneficiaryClient.getById.mockImplementation(async () => {
          await gate;
          return fullBeneficiary();
        });
        return releaseBeneficiary;
      }

      it('CLOSURE_REVIEW: calls closureClient.getById without waiting for the beneficiary lookup to resolve', async () => {
        repository.findById.mockResolvedValue(
          approvalRequest({
            requestType: 'CLOSURE_REVIEW',
            reopenRequestId: null,
            closureId: 'closure-1',
          }),
        );
        const releaseBeneficiary = deferBeneficiaryLookup();
        closureClient.getById.mockResolvedValue({
          id: 'closure-1',
          beneficiaryId: '22222222-2222-2222-2222-222222222222',
          supervisorStatus: 'PENDING',
          closureType: 'MEDICAL',
          closureReasonLookupValueId: 'reason-1',
          closureDate: '2026-08-01T00:00:00.000Z',
          supervisorNotes: null,
        });

        const pending = service.getCardDetail(
          '11111111-1111-1111-1111-111111111111',
          managerCaller,
          authHeader,
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(closureClient.getById).toHaveBeenCalledWith('closure-1', authHeader);

        releaseBeneficiary();
        await pending;
      });

      it('REOPEN: calls reopenRequestClient.getById without waiting for the beneficiary lookup to resolve', async () => {
        repository.findById.mockResolvedValue(
          approvalRequest({ requestType: 'REOPEN', reopenRequestId: 'reopen-1' }),
        );
        const releaseBeneficiary = deferBeneficiaryLookup();
        reopenRequestClient.getById.mockResolvedValue({
          id: 'reopen-1',
          beneficiaryId: '22222222-2222-2222-2222-222222222222',
          supervisorStatus: 'PENDING',
          requestReason: 'CLOSED_BY_MISTAKE',
          decisionNotes: null,
        });

        const pending = service.getCardDetail(
          '11111111-1111-1111-1111-111111111111',
          managerCaller,
          authHeader,
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(reopenRequestClient.getById).toHaveBeenCalledWith('reopen-1', authHeader);

        releaseBeneficiary();
        await pending;
      });

      it('ACCOMPANIED_REFERRAL: calls referralClient.getById without waiting for the beneficiary lookup to resolve', async () => {
        repository.findById.mockResolvedValue(
          approvalRequest({
            requestType: 'ACCOMPANIED_REFERRAL',
            reopenRequestId: null,
            referralId: 'referral-1',
          }),
        );
        const releaseBeneficiary = deferBeneficiaryLookup();
        referralClient.getById.mockResolvedValue({
          id: 'referral-1',
          beneficiaryId: '22222222-2222-2222-2222-222222222222',
          status: 'PENDING_FOLLOWUP',
          visitId: null,
          referralDate: '2026-07-01T00:00:00.000Z',
          facilityType: 'PHC',
          facilityName: 'Sample PHC',
          photoEvidenceMediaAssetId: null,
          incompleteCount: 0,
          latestFollowup: null,
        });

        const pending = service.getCardDetail(
          '11111111-1111-1111-1111-111111111111',
          managerCaller,
          authHeader,
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(referralClient.getById).toHaveBeenCalledWith('referral-1', authHeader);

        releaseBeneficiary();
        await pending;
      });

      it('REFERRAL_INCOMPLETE: calls referralClient.getById without waiting for the beneficiary lookup to resolve', async () => {
        repository.findById.mockResolvedValue(
          approvalRequest({
            requestType: 'REFERRAL_INCOMPLETE',
            reopenRequestId: null,
            referralId: 'referral-1',
          }),
        );
        const releaseBeneficiary = deferBeneficiaryLookup();
        referralClient.getById.mockResolvedValue({
          id: 'referral-1',
          beneficiaryId: '22222222-2222-2222-2222-222222222222',
          status: 'PENDING_FOLLOWUP',
          visitId: null,
          referralDate: '2026-07-01T00:00:00.000Z',
          facilityType: null,
          facilityName: null,
          photoEvidenceMediaAssetId: null,
          incompleteCount: 0,
          latestFollowup: null,
        });

        const pending = service.getCardDetail(
          '11111111-1111-1111-1111-111111111111',
          managerCaller,
          authHeader,
        );
        await Promise.resolve();
        await Promise.resolve();

        expect(referralClient.getById).toHaveBeenCalledWith('referral-1', authHeader);

        releaseBeneficiary();
        await pending;
      });

      it('REFERRAL_INCOMPLETE: still calls visitClient.getById only after referral resolves, with referral.visitId', async () => {
        repository.findById.mockResolvedValue(
          approvalRequest({
            requestType: 'REFERRAL_INCOMPLETE',
            reopenRequestId: null,
            referralId: 'referral-1',
          }),
        );
        referralClient.getById.mockResolvedValue({
          id: 'referral-1',
          beneficiaryId: '22222222-2222-2222-2222-222222222222',
          status: 'PENDING_FOLLOWUP',
          visitId: 'visit-1',
          referralDate: '2026-07-01T00:00:00.000Z',
          facilityType: null,
          facilityName: null,
          photoEvidenceMediaAssetId: null,
          incompleteCount: 0,
          latestFollowup: null,
        });
        visitClient.getById.mockResolvedValue({
          id: 'visit-1',
          scheduleId: 'schedule-1',
          actualVisitDate: null,
          statusLookupValueId: 'status-1',
        });

        await service.getCardDetail(
          '11111111-1111-1111-1111-111111111111',
          managerCaller,
          authHeader,
        );

        expect(visitClient.getById).toHaveBeenCalledWith('visit-1', authHeader);
      });

      it('CLOSURE_REVIEW: a closure lookup failure still degrades closureType to null instead of failing the card', async () => {
        repository.findById.mockResolvedValue(
          approvalRequest({
            requestType: 'CLOSURE_REVIEW',
            reopenRequestId: null,
            closureId: 'closure-1',
          }),
        );
        closureClient.getById.mockRejectedValue(new Error('closure-reopen-service unreachable'));

        const result = await service.getCardDetail(
          '11111111-1111-1111-1111-111111111111',
          managerCaller,
          authHeader,
        );

        expect(result).toMatchObject({ closureType: null });
      });

      it('CLOSURE_REVIEW: a core beneficiary-lookup failure still propagates and fails the whole card', async () => {
        repository.findById.mockResolvedValue(
          approvalRequest({
            requestType: 'CLOSURE_REVIEW',
            reopenRequestId: null,
            closureId: 'closure-1',
          }),
        );
        beneficiaryClient.getById.mockResolvedValue(null);
        closureClient.getById.mockResolvedValue({
          id: 'closure-1',
          beneficiaryId: '22222222-2222-2222-2222-222222222222',
          supervisorStatus: 'PENDING',
          closureType: 'MEDICAL',
          closureReasonLookupValueId: 'reason-1',
          closureDate: '2026-08-01T00:00:00.000Z',
          supervisorNotes: null,
        });

        await expect(
          service.getCardDetail('11111111-1111-1111-1111-111111111111', managerCaller, authHeader),
        ).rejects.toMatchObject({ status: 404 });
      });
    });

    it('EDD_NEARING: returns EDD date and a derived reason', async () => {
      repository.findById.mockResolvedValue(null);
      escalationClient.findById.mockResolvedValue({
        cardId: '66666666-6666-6666-6666-666666666666',
        cardType: 'EDD_NEARING',
        cardSource: 'escalation_events',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        visitId: null,
        referralId: null,
        escalationType: 'EDD_NEARING',
        status: 'OPEN',
        raisedAt: '2026-08-05T11:00:00.000Z',
      });

      const result = await service.getCardDetail(
        '66666666-6666-6666-6666-666666666666',
        managerCaller,
        authHeader,
      );

      expect(result).toMatchObject({
        eddDate: '2026-10-08T00:00:00.000Z',
        sakhiName: 'Priya Sharma',
        beneficiaryName: 'Asha Devi',
      });
      expect((result as unknown as { reason: string }).reason).toContain('2026-10-08');
    });

    it('DATA_RESTORE: returns Sakhi name and id resolved from requestedByUserId', async () => {
      repository.findById.mockResolvedValue(
        approvalRequest({
          requestType: 'DATA_RESTORE',
          reopenRequestId: null,
          beneficiaryId: null,
          requestedByUserId: 'sakhi-user-1',
        }),
      );
      sakhiClient.getById.mockResolvedValue({
        supervisorId: null,
        sakhiId: 'sakhi-user-1',
        displayName: 'Meena Kumari',
        mobileNumber: '+919000000456',
      });

      const result = await service.getCardDetail(
        '11111111-1111-1111-1111-111111111111',
        managerCaller,
        authHeader,
      );

      expect(result).toMatchObject({ sakhiName: 'Meena Kumari', sakhiId: 'sakhi-user-1' });
      expect(sakhiClient.getById).toHaveBeenCalledWith('sakhi-user-1', authHeader);
    });

    it('propagates a core beneficiary-lookup failure rather than degrading it to null', async () => {
      repository.findById.mockResolvedValue(
        approvalRequest({ requestType: 'REOPEN', reopenRequestId: 'reopen-1' }),
      );
      reopenRequestClient.getById.mockResolvedValue({
        id: 'reopen-1',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        supervisorStatus: 'PENDING',
        requestReason: 'CLOSED_BY_MISTAKE',
        decisionNotes: null,
      });
      beneficiaryClient.getById.mockRejectedValue(
        Object.assign(new Error('Bad gateway'), { status: 502 }),
      );

      await expect(
        service.getCardDetail('11111111-1111-1111-1111-111111111111', managerCaller, authHeader),
      ).rejects.toMatchObject({ status: 502 });
    });

    it('degrades a supplementary lookup (Pada) to null on failure instead of failing the whole card', async () => {
      repository.findById.mockResolvedValue(
        approvalRequest({ requestType: 'REOPEN', reopenRequestId: 'reopen-1' }),
      );
      reopenRequestClient.getById.mockResolvedValue({
        id: 'reopen-1',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        supervisorStatus: 'PENDING',
        requestReason: 'CLOSED_BY_MISTAKE',
        decisionNotes: null,
      });
      geographyClient.getById.mockRejectedValue(new Error('auth-service unreachable'));

      const result = await service.getCardDetail(
        '11111111-1111-1111-1111-111111111111',
        managerCaller,
        authHeader,
      );

      expect(result).toMatchObject({ padaName: null, reasonForReopen: 'CLOSED_BY_MISTAKE' });
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('falls back to the thin card shape for an unsupported requestType', async () => {
      repository.findById.mockResolvedValue(
        approvalRequest({ requestType: 'SOMETHING_UNKNOWN', reopenRequestId: null }),
      );

      const result = await service.getCardDetail(
        '11111111-1111-1111-1111-111111111111',
        managerCaller,
        authHeader,
      );

      expect(result).toEqual({
        cardId: '11111111-1111-1111-1111-111111111111',
        cardType: 'SOMETHING_UNKNOWN',
        cardSource: 'approval_requests',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        raisedAt: expect.any(String),
      });
      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
    });
  });

  describe('getCardDetails', () => {
    it('resolves multiple ids and returns all found cards', async () => {
      repository.findById.mockImplementation((async (id: string) => {
        if (id === '11111111-1111-1111-1111-111111111111') {
          return approvalRequest({ requestType: 'SOMETHING_UNKNOWN', reopenRequestId: null });
        }
        if (id === '55555555-5555-5555-5555-555555555555') {
          return approvalRequest({
            id: '55555555-5555-5555-5555-555555555555',
            requestType: 'SOMETHING_UNKNOWN',
            reopenRequestId: null,
          });
        }
        return null;
      }) as never);
      escalationClient.findById.mockResolvedValue(null);

      const result = await service.getCardDetails(
        ['11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555'],
        managerCaller,
        authHeader,
      );

      expect(result).toHaveLength(2);
      expect(result.map((card) => card.cardId).sort()).toEqual(
        ['11111111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555'].sort(),
      );
    });

    it('dedupes a repeated id in the requested list', async () => {
      repository.findById.mockResolvedValue(
        approvalRequest({ requestType: 'SOMETHING_UNKNOWN', reopenRequestId: null }),
      );
      escalationClient.findById.mockResolvedValue(null);

      const result = await service.getCardDetails(
        ['11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'],
        managerCaller,
        authHeader,
      );

      expect(result).toHaveLength(1);
      expect(repository.findById).toHaveBeenCalledTimes(1);
    });

    it('omits an id that matches neither approval_requests nor escalation_events, without failing the batch', async () => {
      repository.findById.mockImplementation((async (id: string) =>
        id === '11111111-1111-1111-1111-111111111111'
          ? approvalRequest({ requestType: 'SOMETHING_UNKNOWN', reopenRequestId: null })
          : null) as never);
      escalationClient.findById.mockResolvedValue(null);

      const result = await service.getCardDetails(
        ['11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999'],
        managerCaller,
        authHeader,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ cardId: '11111111-1111-1111-1111-111111111111' });
    });

    it("omits an id outside a SUPERVISOR caller's roster, without failing the batch", async () => {
      sakhiClient.getOwnSakhiIds.mockResolvedValue(['44444444-4444-4444-4444-444444444444']);
      repository.findById.mockImplementation((async (id: string) => {
        if (id === '11111111-1111-1111-1111-111111111111') {
          return approvalRequest({ requestType: 'SOMETHING_UNKNOWN', reopenRequestId: null });
        }
        if (id === '66666666-6666-6666-6666-666666666666') {
          return approvalRequest({
            id: '66666666-6666-6666-6666-666666666666',
            requestType: 'SOMETHING_UNKNOWN',
            reopenRequestId: null,
            requestedByUserId: 'some-other-sakhi',
          });
        }
        return null;
      }) as never);
      escalationClient.findById.mockResolvedValue(null);

      const result = await service.getCardDetails(
        ['11111111-1111-1111-1111-111111111111', '66666666-6666-6666-6666-666666666666'],
        supervisorCaller('project-1'),
        authHeader,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ cardId: '11111111-1111-1111-1111-111111111111' });
    });

    it('returns an empty array when none of the requested ids resolve', async () => {
      repository.findById.mockResolvedValue(null);
      escalationClient.findById.mockResolvedValue(null);

      const result = await service.getCardDetails(
        ['11111111-1111-1111-1111-111111111111', '99999999-9999-9999-9999-999999999999'],
        managerCaller,
        authHeader,
      );

      expect(result).toEqual([]);
    });

    it("resolves a SUPERVISOR caller's own Sakhi roster once for the whole batch, not once per id", async () => {
      sakhiClient.getOwnSakhiIds.mockResolvedValue(['44444444-4444-4444-4444-444444444444']);
      repository.findById.mockImplementation((async (id: string) =>
        approvalRequest({ id, requestType: 'SOMETHING_UNKNOWN', reopenRequestId: null })) as never);
      escalationClient.findById.mockResolvedValue(null);

      const result = await service.getCardDetails(
        [
          '11111111-1111-1111-1111-111111111111',
          '22222222-2222-2222-2222-222222222222',
          '33333333-3333-3333-3333-333333333333',
        ],
        supervisorCaller('project-1'),
        authHeader,
      );

      expect(result).toHaveLength(3);
      expect(sakhiClient.getOwnSakhiIds).toHaveBeenCalledTimes(1);
    });

    it('logs and omits an id whose enrichment fails with an unexpected (non-HttpError) error, without failing the batch', async () => {
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
      repository.findById.mockImplementation((async (id: string) => {
        if (id === '11111111-1111-1111-1111-111111111111') {
          throw new Error('downstream service outage');
        }
        return approvalRequest({ id, requestType: 'SOMETHING_UNKNOWN', reopenRequestId: null });
      }) as never);
      escalationClient.findById.mockResolvedValue(null);

      const result = await service.getCardDetails(
        ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
        managerCaller,
        authHeader,
      );

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ cardId: '22222222-2222-2222-2222-222222222222' });
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('unexpected failure'),
        expect.any(Error),
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('decide — EDD_NEARING (escalation_events)', () => {
    it('acknowledges OKAY by actually calling the real acknowledge endpoint', async () => {
      escalationClient.findById.mockResolvedValue(escalationCard());
      escalationClient.acknowledgeEddNearing.mockResolvedValue({
        id: '66666666-6666-6666-6666-666666666666',
        status: 'ACKNOWLEDGED',
        actionTaken: null,
      });

      const result = await service.decide(
        '66666666-6666-6666-6666-666666666666',
        { cardSource: 'escalation_events', decision: 'OKAY' },
        decidedByCaller,
        authHeader,
      );

      expect(result).toMatchObject({
        decision: 'OKAY',
        acknowledged: true,
        status: 'ACKNOWLEDGED',
      });
      expect(escalationClient.acknowledgeEddNearing).toHaveBeenCalledWith(
        '66666666-6666-6666-6666-666666666666',
        authHeader,
      );
    });

    it('404s when the escalation card does not exist', async () => {
      escalationClient.findById.mockResolvedValue(null);

      await expect(
        service.decide(
          '66666666-6666-6666-6666-666666666666',
          { cardSource: 'escalation_events', decision: 'OKAY' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 404 });
      expect(escalationClient.acknowledgeEddNearing).not.toHaveBeenCalled();
    });

    it('501s a non-OKAY decision on an escalation card without calling the client', async () => {
      escalationClient.findById.mockResolvedValue(escalationCard());

      await expect(
        service.decide(
          '66666666-6666-6666-6666-666666666666',
          { cardSource: 'escalation_events', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 501 });
      expect(escalationClient.acknowledgeEddNearing).not.toHaveBeenCalled();
    });

    it('surfaces the downstream 409 when the card was already acknowledged, rather than faking a second success', async () => {
      escalationClient.findById.mockResolvedValue(escalationCard());
      escalationClient.acknowledgeEddNearing.mockRejectedValue(
        Object.assign(new Error('This EDD Nearing card has already been decided.'), {
          status: 409,
        }),
      );

      await expect(
        service.decide(
          '66666666-6666-6666-6666-666666666666',
          { cardSource: 'escalation_events', decision: 'OKAY' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('decide — MISSED_VISIT (escalation_events)', () => {
    function missedVisitCard(overrides: Partial<Record<string, unknown>> = {}) {
      return escalationCard({
        cardType: 'MISSED_VISIT',
        escalationType: 'ANC_2_MISSED',
        ...overrides,
      });
    }

    it('CLOSE calls the real close endpoint', async () => {
      escalationClient.findById.mockResolvedValue(missedVisitCard());
      escalationClient.decideMissedVisit.mockResolvedValue({
        id: '66666666-6666-6666-6666-666666666666',
        status: 'RESOLVED',
        actionTaken: 'CLOSE',
      });

      const result = await service.decide(
        '66666666-6666-6666-6666-666666666666',
        { cardSource: 'escalation_events', decision: 'CLOSE' },
        decidedByCaller,
        authHeader,
      );

      expect(result).toMatchObject({ decision: 'CLOSE', status: 'RESOLVED' });
      expect(escalationClient.decideMissedVisit).toHaveBeenCalledWith(
        '66666666-6666-6666-6666-666666666666',
        'CLOSE',
        authHeader,
      );
    });

    it('TRANSFER calls the real transfer endpoint (FR-SV-4.3)', async () => {
      escalationClient.findById.mockResolvedValue(missedVisitCard());
      escalationClient.decideMissedVisit.mockResolvedValue({
        id: '66666666-6666-6666-6666-666666666666',
        status: 'TRANSFER_REQUESTED',
        actionTaken: 'TRANSFER',
      });

      const result = await service.decide(
        '66666666-6666-6666-6666-666666666666',
        { cardSource: 'escalation_events', decision: 'TRANSFER' },
        decidedByCaller,
        authHeader,
      );

      expect(result).toMatchObject({ decision: 'TRANSFER', status: 'TRANSFER_REQUESTED' });
      expect(escalationClient.decideMissedVisit).toHaveBeenCalledWith(
        '66666666-6666-6666-6666-666666666666',
        'TRANSFER',
        authHeader,
      );
    });

    it('501s an unrelated decision value (e.g. APPROVE) without calling the client', async () => {
      escalationClient.findById.mockResolvedValue(missedVisitCard());

      await expect(
        service.decide(
          '66666666-6666-6666-6666-666666666666',
          { cardSource: 'escalation_events', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 501 });
      expect(escalationClient.decideMissedVisit).not.toHaveBeenCalled();
    });
  });

  describe('decide — approval_requests roster scoping (write-path IDOR)', () => {
    it("rejects with 403 when the raising Sakhi is outside the SUPERVISOR caller's own roster, without calling any downstream client", async () => {
      sakhiClient.getOwnSakhiIds.mockResolvedValue(['some-other-sakhi']);
      repository.findById.mockResolvedValue(approvalRequest());

      await expect(
        service.decide(
          '11111111-1111-1111-1111-111111111111',
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          supervisorCaller('project-1'),
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 403 });
      expect(reopenRequestClient.decide).not.toHaveBeenCalled();
      expect(repository.markDecided).not.toHaveBeenCalled();
    });

    it("decides normally when the raising Sakhi is in the SUPERVISOR caller's own roster", async () => {
      sakhiClient.getOwnSakhiIds.mockResolvedValue(['44444444-4444-4444-4444-444444444444']);
      repository.findById.mockResolvedValue(approvalRequest());
      reopenRequestClient.decide.mockResolvedValue({
        id: '33333333-3333-3333-3333-333333333333',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        supervisorStatus: 'APPROVED',
      });

      const result = await service.decide(
        '11111111-1111-1111-1111-111111111111',
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        supervisorCaller('project-1'),
        authHeader,
      );

      expect(result.decision).toBe('APPROVE');
    });

    it('MANAGER/ADMIN can decide any card regardless of roster', async () => {
      repository.findById.mockResolvedValue(approvalRequest());
      reopenRequestClient.decide.mockResolvedValue({
        id: '33333333-3333-3333-3333-333333333333',
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        supervisorStatus: 'APPROVED',
      });

      const result = await service.decide(
        '11111111-1111-1111-1111-111111111111',
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        managerCaller,
        authHeader,
      );

      expect(result.decision).toBe('APPROVE');
      expect(sakhiClient.getOwnSakhiIds).not.toHaveBeenCalled();
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
        decidedByCaller,
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
        decidedByCaller,
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
          decidedByCaller,
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
          decidedByCaller,
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
          decidedByCaller,
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
        decidedByCaller,
        authHeader,
      );

      expect(userClient.reactivateUser).toHaveBeenCalledWith(card.requestedByUserId, authHeader);
      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'DATA_RESTORE_UPDATE',
        expect.any(String),
        expect.any(String),
        authHeader,
        { linkedEntityType: 'QuickResponseCard', linkedEntityId: card.id },
      );
      expect(result.decision).toBe('APPROVE');
    });

    it("approves: title interpolates the Sakhi's resolved display name", async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockResolvedValue({
        id: card.requestedByUserId as string,
        status: 'ACTIVE',
      });
      sakhiClient.getById.mockResolvedValue({
        supervisorId: null,
        sakhiId: card.requestedByUserId as string,
        displayName: 'Meena Kumari',
        mobileNumber: '+919000000456',
      });

      await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'DATA_RESTORE_UPDATE',
        'Data restore request — Meena Kumari',
        'Your account has been reactivated.',
        authHeader,
        { linkedEntityType: 'QuickResponseCard', linkedEntityId: card.id },
      );
    });

    it('approves: falls back to generic title when the Sakhi name lookup fails', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockResolvedValue({
        id: card.requestedByUserId as string,
        status: 'ACTIVE',
      });
      sakhiClient.getById.mockRejectedValue(new Error('auth-service down'));

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'DATA_RESTORE_UPDATE',
        'Data restore request decided',
        expect.any(String),
        authHeader,
        { linkedEntityType: 'QuickResponseCard', linkedEntityId: card.id },
      );
      expect(result.decision).toBe('APPROVE');
    });

    it('rejects: makes no reactivation call, still notifies', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'REJECT' },
        decidedByCaller,
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
          decidedByCaller,
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
          decidedByCaller,
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
        decidedByCaller,
        authHeader,
      );
      expect(result.decision).toBe('APPROVE');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('marks the card decided (decisionStatusLookupId, decidedByUserId) before reactivating — DATA_RESTORE claims the row before the side effect', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockResolvedValue({
        id: card.requestedByUserId as string,
        status: 'ACTIVE',
      });

      await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE', decisionNotes: 'Verified' },
        decidedByCaller,
        authHeader,
      );

      expect(repository.markDecided).toHaveBeenCalledWith(
        card.id,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        DECIDED_BY_USER_ID,
        'Verified',
        undefined,
      );
    });

    it('409s without reactivating when markDecided loses the pre-claim race', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      repository.markDecided.mockResolvedValue(false);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });

      expect(userClient.reactivateUser).not.toHaveBeenCalled();
    });

    it('concurrent decides on the same DATA_RESTORE card: exactly one succeeds and reactivates, the other 409s', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockResolvedValue({
        id: card.requestedByUserId as string,
        status: 'ACTIVE',
      });
      // Simulates two concurrent requests racing to claim the same row:
      // the first atomic markDecided call wins, the second loses.
      repository.markDecided.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const [first, second] = await Promise.allSettled([
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ]);

      const outcomes = [first, second];
      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
      expect(userClient.reactivateUser).toHaveBeenCalledTimes(1);
    });

    it('approves: restores beneficiary and visit data for the Sakhi after reactivating', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockResolvedValue({
        id: card.requestedByUserId as string,
        status: 'ACTIVE',
      });
      beneficiaryClient.restoreForSakhi.mockResolvedValue({ restoredCaseCount: 2 });
      visitClient.restoreForSakhi.mockResolvedValue({ restoredVisitCount: 5 });

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(beneficiaryClient.restoreForSakhi).toHaveBeenCalledWith(
        card.requestedByUserId,
        authHeader,
      );
      expect(visitClient.restoreForSakhi).toHaveBeenCalledWith(card.requestedByUserId, authHeader);
      expect(result.decision).toBe('APPROVE');
    });

    it('approves: writes an audit entry recording both restore results', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockResolvedValue({
        id: card.requestedByUserId as string,
        status: 'ACTIVE',
      });
      beneficiaryClient.restoreForSakhi.mockResolvedValue({ restoredCaseCount: 2 });
      visitClient.restoreForSakhi.mockResolvedValue({ restoredVisitCount: 5 });

      await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(auditClient.log).toHaveBeenCalledWith(
        DECIDED_BY_USER_ID,
        'DATA_RESTORE_APPROVED',
        'User',
        card.requestedByUserId,
        {
          beneficiaryRestoreResult: { restoredCaseCount: 2 },
          visitRestoreResult: { restoredVisitCount: 5 },
        },
        authHeader,
      );
    });

    it('rejects: writes an audit entry that makes no restore claim', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);

      await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'REJECT', decisionNotes: 'Not eligible' },
        decidedByCaller,
        authHeader,
      );

      expect(auditClient.log).toHaveBeenCalledWith(
        DECIDED_BY_USER_ID,
        'DATA_RESTORE_REJECTED',
        'User',
        card.requestedByUserId,
        { decision: 'REJECTED', reason: 'Not eligible' },
        authHeader,
      );
      expect(beneficiaryClient.restoreForSakhi).not.toHaveBeenCalled();
      expect(visitClient.restoreForSakhi).not.toHaveBeenCalled();
    });

    it('does not fail the approval when the beneficiary restore fails, and records the failure in the audit entry', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockResolvedValue({
        id: card.requestedByUserId as string,
        status: 'ACTIVE',
      });
      beneficiaryClient.restoreForSakhi.mockRejectedValue(new Error('beneficiary-service down'));
      visitClient.restoreForSakhi.mockResolvedValue({ restoredVisitCount: 5 });

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(result.decision).toBe('APPROVE');
      expect(consoleErrorSpy).toHaveBeenCalled();
      expect(auditClient.log).toHaveBeenCalledWith(
        DECIDED_BY_USER_ID,
        'DATA_RESTORE_APPROVED',
        'User',
        card.requestedByUserId,
        {
          beneficiaryRestoreResult: { error: 'beneficiary-service down' },
          visitRestoreResult: { restoredVisitCount: 5 },
        },
        authHeader,
      );
      // The account was already reactivated and that succeeded — a Sakhi
      // still gets notified even though her data restore partially failed.
      expect(notificationClient.notify).toHaveBeenCalled();
    });

    it('does not fail the approval when the visit restore fails, and records the failure in the audit entry', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockResolvedValue({
        id: card.requestedByUserId as string,
        status: 'ACTIVE',
      });
      beneficiaryClient.restoreForSakhi.mockResolvedValue({ restoredCaseCount: 2 });
      visitClient.restoreForSakhi.mockRejectedValue(new Error('visit-form-service down'));

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(result.decision).toBe('APPROVE');
      expect(auditClient.log).toHaveBeenCalledWith(
        DECIDED_BY_USER_ID,
        'DATA_RESTORE_APPROVED',
        'User',
        card.requestedByUserId,
        {
          beneficiaryRestoreResult: { restoredCaseCount: 2 },
          visitRestoreResult: { error: 'visit-form-service down' },
        },
        authHeader,
      );
    });

    it('does not fail the approval when both restore calls fail, and records both failures', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockResolvedValue({
        id: card.requestedByUserId as string,
        status: 'ACTIVE',
      });
      beneficiaryClient.restoreForSakhi.mockRejectedValue(new Error('beneficiary-service down'));
      visitClient.restoreForSakhi.mockRejectedValue(new Error('visit-form-service down'));

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(result.decision).toBe('APPROVE');
      expect(auditClient.log).toHaveBeenCalledWith(
        DECIDED_BY_USER_ID,
        'DATA_RESTORE_APPROVED',
        'User',
        card.requestedByUserId,
        {
          beneficiaryRestoreResult: { error: 'beneficiary-service down' },
          visitRestoreResult: { error: 'visit-form-service down' },
        },
        authHeader,
      );
    });

    it('does not fail the approval when writing the audit entry throws, and the Sakhi is still notified', async () => {
      const card = dataRestoreRequest();
      repository.findById.mockResolvedValue(card);
      userClient.reactivateUser.mockResolvedValue({
        id: card.requestedByUserId as string,
        status: 'ACTIVE',
      });
      beneficiaryClient.restoreForSakhi.mockResolvedValue({ restoredCaseCount: 0 });
      visitClient.restoreForSakhi.mockResolvedValue({ restoredVisitCount: 0 });
      auditClient.log.mockRejectedValue(new Error('audit-service down'));

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(result.decision).toBe('APPROVE');
      expect(notificationClient.notify).toHaveBeenCalled();
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

      const result = await service.list(
        { status: 'PENDING', limit: 50 },
        managerCaller,
        authHeader,
      );
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
        decidedByCaller,
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
        decidedByCaller,
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
          decidedByCaller,
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
          decidedByCaller,
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
          decidedByCaller,
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
        decidedByCaller,
        authHeader,
      );

      expect(referralClient.decide).toHaveBeenCalledWith(card.referralId, 'LAPSE', authHeader);
      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'REFERRAL_INCOMPLETE_UPDATE',
        expect.any(String),
        expect.any(String),
        authHeader,
        { linkedEntityType: 'Referral', linkedEntityId: card.referralId },
        undefined,
      );
      expect(result.decision).toBe('APPROVE');
    });

    it('approves: title/body interpolate the resolved Sakhi and beneficiary names', async () => {
      const card = referralIncompleteRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockResolvedValue({
        id: card.referralId as unknown as string,
        beneficiaryId: card.beneficiaryId as string,
        status: 'LAPSED',
      });
      sakhiClient.getById.mockResolvedValue({
        supervisorId: null,
        sakhiId: card.requestedByUserId as string,
        displayName: 'Priya Sakhi',
        mobileNumber: '+919000000123',
      });
      beneficiaryClient.getById.mockResolvedValue({
        id: card.beneficiaryId as string,
        sakhiId: '88888888-8888-8888-8888-888888888888',
        pii: { fullName: 'Asha Devi', padaId: null },
        motherCaseDetails: null,
        riskConditionSummaries: [],
      });

      await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(beneficiaryClient.getById).toHaveBeenCalledWith(card.beneficiaryId, authHeader);
      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'REFERRAL_INCOMPLETE_UPDATE',
        'Referral follow-up — Priya Sakhi',
        "Asha Devi's referral follow-up was marked Lapsed",
        authHeader,
        { linkedEntityType: 'Referral', linkedEntityId: card.referralId },
        undefined,
      );
    });

    it('approves: falls back to a generic body when the card has no linked beneficiary', async () => {
      const card = referralIncompleteRequest({ beneficiaryId: null });
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockResolvedValue({
        id: card.referralId as unknown as string,
        beneficiaryId: '22222222-2222-2222-2222-222222222222',
        status: 'LAPSED',
      });
      sakhiClient.getById.mockResolvedValue({
        supervisorId: null,
        sakhiId: card.requestedByUserId as string,
        displayName: 'Priya Sakhi',
        mobileNumber: '+919000000123',
      });

      await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'REFERRAL_INCOMPLETE_UPDATE',
        'Referral follow-up — Priya Sakhi',
        'Your referral follow-up was marked Lapsed by your Supervisor.',
        authHeader,
        { linkedEntityType: 'Referral', linkedEntityId: card.referralId },
        undefined,
      );
    });

    it('rejects: decides via ReferralClient with REFILL and notifies the Sakhi with a Fill Referral Form CTA', async () => {
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
        decidedByCaller,
        authHeader,
      );
      expect(referralClient.decide).toHaveBeenCalledWith(card.referralId, 'REFILL', authHeader);
      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'REFERRAL_INCOMPLETE_UPDATE',
        expect.any(String),
        expect.any(String),
        authHeader,
        { linkedEntityType: 'Referral', linkedEntityId: card.referralId },
        'FILL_REFERRAL_FORM',
      );
      expect(result.decision).toBe('REJECT');
    });

    it('500s when the card has no linked referral', async () => {
      const card = referralIncompleteRequest({ referralId: null });
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
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
          decidedByCaller,
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
          decidedByCaller,
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
        decidedByCaller,
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

    it('approves: completes the referral, resolves the Sakhi, triggers the incentive, notifies with interpolated names', async () => {
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
        pii: { fullName: 'Test Beneficiary', padaId: null },
        motherCaseDetails: null,
        riskConditionSummaries: [],
      });
      sakhiClient.getById.mockResolvedValue({
        supervisorId: null,
        sakhiId: card.requestedByUserId as string,
        displayName: 'Priya Sakhi',
        mobileNumber: '+919000000123',
      });

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(referralClient.decide).toHaveBeenCalledWith(card.referralId, 'COMPLETE', authHeader);
      expect(beneficiaryClient.getById).toHaveBeenCalledWith(card.beneficiaryId, authHeader);
      expect(beneficiaryClient.getById).toHaveBeenCalledTimes(1);
      expect(incentiveClient.triggerAccompaniedReferral).toHaveBeenCalledWith(
        '88888888-8888-8888-8888-888888888888',
        card.referralId,
        authHeader,
      );
      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'ACCOMPANIED_REFERRAL_UPDATE',
        'Accompanied referral — Priya Sakhi',
        "Test Beneficiary's accompanied referral was approved and completed",
        authHeader,
        { linkedEntityType: 'QuickResponseCard', linkedEntityId: card.id },
      );
      expect(result.decision).toBe('APPROVE');
    });

    it('approves: waits for referralClient.decide to resolve before calling beneficiaryClient.getById', async () => {
      const card = accompaniedReferralRequest();
      repository.findById.mockResolvedValue(card);
      let releaseReferralDecide!: () => void;
      referralClient.decide.mockImplementation(
        () =>
          new Promise((resolve) => {
            releaseReferralDecide = () =>
              resolve({
                id: card.referralId as unknown as string,
                beneficiaryId: card.beneficiaryId as string,
                status: 'COMPLETED',
              });
          }),
      );
      beneficiaryClient.getById.mockResolvedValue({
        id: card.beneficiaryId as string,
        sakhiId: '88888888-8888-8888-8888-888888888888',
        pii: { fullName: 'Test Beneficiary', padaId: null },
        motherCaseDetails: null,
        riskConditionSummaries: [],
      });
      sakhiClient.getById.mockResolvedValue({
        supervisorId: null,
        sakhiId: card.requestedByUserId as string,
        displayName: 'Priya Sakhi',
        mobileNumber: '+919000000123',
      });

      const pending = service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );
      await Promise.resolve();
      await Promise.resolve();

      // referralClient.decide() is still pending — beneficiaryClient.getById
      // must not have been called yet. This is the sequential guarantee the
      // incentive-trigger catch block relies on (the referral must already
      // be COMPLETE by the time it runs).
      expect(beneficiaryClient.getById).not.toHaveBeenCalled();

      releaseReferralDecide();
      await pending;

      expect(beneficiaryClient.getById).toHaveBeenCalledWith(card.beneficiaryId, authHeader);
    });

    it('approves: never calls beneficiaryClient.getById if referralClient.decide rejects', async () => {
      const card = accompaniedReferralRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockRejectedValue(new Error('risk-referral-service unreachable'));

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toThrow('risk-referral-service unreachable');

      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
    });

    it('approves: propagates a referralClient.decide failure without triggering the incentive or marking the referral complete', async () => {
      const card = accompaniedReferralRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockRejectedValue(new Error('risk-referral-service unreachable'));
      beneficiaryClient.getById.mockResolvedValue({
        id: card.beneficiaryId as string,
        sakhiId: '88888888-8888-8888-8888-888888888888',
        pii: { fullName: 'Test Beneficiary', padaId: null },
        motherCaseDetails: null,
        riskConditionSummaries: [],
      });

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toThrow('risk-referral-service unreachable');
      expect(incentiveClient.triggerAccompaniedReferral).not.toHaveBeenCalled();
      expect(notificationClient.notify).not.toHaveBeenCalled();
    });

    it('approves: propagates a beneficiary-lookup failure without triggering the incentive', async () => {
      const card = accompaniedReferralRequest();
      repository.findById.mockResolvedValue(card);
      referralClient.decide.mockResolvedValue({
        id: card.referralId as unknown as string,
        beneficiaryId: card.beneficiaryId as string,
        status: 'COMPLETED',
      });
      beneficiaryClient.getById.mockRejectedValue(new Error('beneficiary-service unreachable'));

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toThrow('beneficiary-service unreachable');
      expect(incentiveClient.triggerAccompaniedReferral).not.toHaveBeenCalled();
      expect(notificationClient.notify).not.toHaveBeenCalled();
    });

    it('rejects: makes no referral-side call, no incentive, still notifies', async () => {
      const card = accompaniedReferralRequest();
      repository.findById.mockResolvedValue(card);

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'REJECT' },
        decidedByCaller,
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
          decidedByCaller,
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
          decidedByCaller,
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
      // The beneficiary lookup runs concurrently with referralClient.decide()
      // (see the "without waiting for referralClient.decide to resolve" test
      // above) — it IS still dispatched here, but its result is discarded
      // once referralClient.decide rejects, so no incentive/notification follows.
      beneficiaryClient.getById.mockResolvedValue({
        id: card.beneficiaryId as string,
        sakhiId: '88888888-8888-8888-8888-888888888888',
        pii: { fullName: 'Test Beneficiary', padaId: null },
        motherCaseDetails: null,
        riskConditionSummaries: [],
      });

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(incentiveClient.triggerAccompaniedReferral).not.toHaveBeenCalled();
      expect(notificationClient.notify).not.toHaveBeenCalled();
    });

    it('does not fail the request when the incentive trigger fails after the referral is already COMPLETED', async () => {
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
        pii: { fullName: 'Test Beneficiary', padaId: null },
        motherCaseDetails: null,
        riskConditionSummaries: [],
      });
      incentiveClient.triggerAccompaniedReferral.mockRejectedValue(
        Object.assign(new Error('No active incentive rate'), { status: 404 }),
      );

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      // The referral decision (already committed, unretryable) must not be
      // undone by a downstream incentive failure — the request still
      // succeeds and the Sakhi is still notified.
      expect(result.decision).toBe('APPROVE');
      expect(notificationClient.notify).toHaveBeenCalled();
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
          decidedByCaller,
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
        pii: { fullName: 'Test Beneficiary', padaId: null },
        motherCaseDetails: null,
        riskConditionSummaries: [],
      });
      notificationClient.notify.mockRejectedValue(
        Object.assign(new Error('Forbidden'), { status: 403 }),
      );

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
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
        decidedByCaller,
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
        { linkedEntityType: 'QuickResponseCard', linkedEntityId: card.id },
      );
      expect(result.decision).toBe('APPROVE');
    });

    it('approves: title/body interpolate the resolved Sakhi and beneficiary names', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);
      beneficiaryClient.applyLmpChange.mockResolvedValue({ id: card.beneficiaryId as string });
      sakhiClient.getById.mockResolvedValue({
        supervisorId: null,
        sakhiId: card.requestedByUserId as string,
        displayName: 'Priya Sakhi',
        mobileNumber: '+919000000123',
      });
      beneficiaryClient.getById.mockResolvedValue({
        id: card.beneficiaryId as string,
        sakhiId: '88888888-8888-8888-8888-888888888888',
        pii: { fullName: 'Asha Devi', padaId: null },
        motherCaseDetails: null,
        riskConditionSummaries: [],
      });

      await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'LMP_CHANGE_UPDATE',
        'LMP change request — Priya Sakhi',
        "Asha Devi's LMP change was approved",
        authHeader,
        { linkedEntityType: 'QuickResponseCard', linkedEntityId: card.id },
      );
    });

    it('approves: falls back to generic title/body when name lookups fail', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);
      beneficiaryClient.applyLmpChange.mockResolvedValue({ id: card.beneficiaryId as string });
      sakhiClient.getById.mockRejectedValue(new Error('auth-service down'));
      beneficiaryClient.getById.mockRejectedValue(new Error('beneficiary-service down'));

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(notificationClient.notify).toHaveBeenCalledWith(
        card.requestedByUserId,
        'LMP_CHANGE_UPDATE',
        'LMP change request decided',
        'Your LMP change request was approved.',
        authHeader,
        { linkedEntityType: 'QuickResponseCard', linkedEntityId: card.id },
      );
      expect(result.decision).toBe('APPROVE');
    });

    it('rejects: does not call BeneficiaryClient, still notifies the Sakhi', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'REJECT' },
        decidedByCaller,
        authHeader,
      );

      expect(beneficiaryClient.applyLmpChange).not.toHaveBeenCalled();
      expect(notificationClient.notify).toHaveBeenCalled();
      expect(result.decision).toBe('REJECT');
    });

    it('approves: writes an audit entry after the LMP change is applied', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);
      beneficiaryClient.applyLmpChange.mockResolvedValue({ id: card.beneficiaryId as string });

      await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(auditClient.log).toHaveBeenCalledTimes(1);
      expect(auditClient.log).toHaveBeenCalledWith(
        DECIDED_BY_USER_ID,
        'LMP_CHANGE_APPROVED',
        'MotherCaseDetails',
        card.beneficiaryId,
        { lmpDate: '2026-06-15' },
        authHeader,
      );
    });

    it('rejects: writes an audit entry that does not claim an LMP value changed', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);

      await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'REJECT', decisionNotes: 'Not plausible' },
        decidedByCaller,
        authHeader,
      );

      expect(auditClient.log).toHaveBeenCalledTimes(1);
      expect(auditClient.log).toHaveBeenCalledWith(
        DECIDED_BY_USER_ID,
        'LMP_CHANGE_REJECTED',
        'MotherCaseDetails',
        card.beneficiaryId,
        { decision: 'REJECTED', reason: 'Not plausible' },
        authHeader,
      );
      expect(beneficiaryClient.applyLmpChange).not.toHaveBeenCalled();
    });

    it('rejects: audit entry reason is null when no decisionNotes were given', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);

      await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'REJECT' },
        decidedByCaller,
        authHeader,
      );

      expect(auditClient.log).toHaveBeenCalledWith(
        DECIDED_BY_USER_ID,
        'LMP_CHANGE_REJECTED',
        'MotherCaseDetails',
        card.beneficiaryId,
        { decision: 'REJECTED', reason: null },
        authHeader,
      );
    });

    it('does not fail the approval when writing the audit entry throws, and the Sakhi is still notified', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);
      beneficiaryClient.applyLmpChange.mockResolvedValue({ id: card.beneficiaryId as string });
      auditClient.log.mockRejectedValue(Object.assign(new Error('Bad gateway'), { status: 502 }));

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE' },
        decidedByCaller,
        authHeader,
      );

      expect(result.decision).toBe('APPROVE');
      expect(beneficiaryClient.applyLmpChange).toHaveBeenCalled();
      expect(notificationClient.notify).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('does not fail the rejection when writing the audit entry throws, and the Sakhi is still notified', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);
      auditClient.log.mockRejectedValue(Object.assign(new Error('Bad gateway'), { status: 502 }));

      const result = await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'REJECT' },
        decidedByCaller,
        authHeader,
      );

      expect(result.decision).toBe('REJECT');
      expect(notificationClient.notify).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('422s on approve when requestPayloadJson has no valid newLmpDate', async () => {
      const card = lmpChangeRequest({ requestPayloadJson: { sonographyImageUrl: 'x' } });
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
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
          decidedByCaller,
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
          decidedByCaller,
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
        decidedByCaller,
        authHeader,
      );
      expect(result.decision).toBe('APPROVE');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('marks the card decided (decisionStatusLookupId, decidedByUserId) after a successful approve', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);
      beneficiaryClient.applyLmpChange.mockResolvedValue({ id: card.beneficiaryId as string });

      await service.decide(
        card.id as string,
        { cardSource: 'approval_requests', decision: 'APPROVE', decisionNotes: 'Looks right' },
        decidedByCaller,
        authHeader,
      );

      expect(repository.markDecided).toHaveBeenCalledWith(
        card.id,
        'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
        DECIDED_BY_USER_ID,
        'Looks right',
        undefined,
      );
    });

    it('409s on re-approving an already-decided LMP_CHANGE card — the core bug this guard closes', async () => {
      const card = lmpChangeRequest({ decidedAt: new Date('2026-08-05T12:00:00.000Z') });
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });
      // The LMP write and Sakhi notification must never re-run on a re-approve.
      expect(beneficiaryClient.applyLmpChange).not.toHaveBeenCalled();
      expect(notificationClient.notify).not.toHaveBeenCalled();
    });

    it('propagates a markDecided failure and never applies the LMP change — LMP_CHANGE claims the row before the side effect, not after', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);
      repository.markDecided.mockRejectedValue(new Error('db down'));

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toThrow('db down');

      expect(beneficiaryClient.applyLmpChange).not.toHaveBeenCalled();
    });

    it('409s without applying the LMP change when markDecided loses the pre-claim race', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);
      repository.markDecided.mockResolvedValue(false);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });

      expect(beneficiaryClient.applyLmpChange).not.toHaveBeenCalled();
    });

    it('concurrent decides on the same LMP_CHANGE card: exactly one succeeds and applies the LMP change, the other 409s', async () => {
      const card = lmpChangeRequest();
      repository.findById.mockResolvedValue(card);
      beneficiaryClient.applyLmpChange.mockResolvedValue({ id: card.beneficiaryId as string });
      // Simulates two concurrent requests racing to claim the same row:
      // the first atomic markDecided call wins, the second loses.
      repository.markDecided.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

      const [first, second] = await Promise.allSettled([
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ]);

      const outcomes = [first, second];
      const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
      const rejected = outcomes.filter((o) => o.status === 'rejected');
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toMatchObject({ status: 409 });
      expect(beneficiaryClient.applyLmpChange).toHaveBeenCalledTimes(1);
    });
  });

  describe('decide — already-decided guard applies to every approval_requests card type', () => {
    it('409s on a REOPEN card that was already decided', async () => {
      const card = approvalRequest({
        requestType: 'REOPEN',
        decidedAt: new Date('2026-08-05T12:00:00.000Z'),
      });
      repository.findById.mockResolvedValue(card);

      await expect(
        service.decide(
          card.id as string,
          { cardSource: 'approval_requests', decision: 'APPROVE' },
          decidedByCaller,
          authHeader,
        ),
      ).rejects.toMatchObject({ status: 409 });
      expect(reopenRequestClient.decide).not.toHaveBeenCalled();
    });
  });
});
