import { badRequest, conflict, notFound, unprocessable } from '@armman/service-commons';
import type { EscalationRepository } from './escalation.repository';
import type { ListEscalationEventsInput } from './dto/list-escalation-events.dto';
import type { CreateEscalationEventInput } from './dto/create-escalation-event.dto';
import { BeneficiaryClient, type BeneficiaryRecord } from './beneficiary.client';
import { ManagerNoticeClient } from './manager-notice.client';
import { LookupClient } from './lookup.client';
import { SakhiClient, type SakhiRecord } from './sakhi.client';
import { decideTransfer } from './missed-visit-transfer';
import { MISSED_VISIT_TYPES, MISSED_VISIT_TYPE_MAP } from './missed-visit-types';
import type { NotificationRepository } from '../notifications/notification.repository';
import { fanOutToSupervisor } from '../notifications/supervisor-fanout';
import type { SubmitClosurePendingReasonInput } from './dto/submit-closure-pending-reason.dto';

/** Quick Response's fixed card type for an escalation row — everything else in
 * EscalationType that isn't one of the 8 supported card types is omitted from
 * the response rather than surfaced under an unsupported label. */
function toCardType(escalationType: string): 'MISSED_VISIT' | 'EDD_NEARING' | null {
  if (MISSED_VISIT_TYPES.has(escalationType)) return 'MISSED_VISIT';
  if (escalationType === 'EDD_NEARING') return 'EDD_NEARING';
  return null;
}

/** Missed Visit Escalation detail's own status vocabulary — distinct from the
 * persisted EscalationStatus. Statuses this card type doesn't actually use
 * (e.g. ACKNOWLEDGED, CLOSE_REQUESTED) fall back to PENDING. */
function toMissedVisitDetailStatus(status: string): 'PENDING' | 'TRANSFERRED' | 'CLOSED' {
  if (status === 'TRANSFER_REQUESTED') return 'TRANSFERRED';
  if (status === 'RESOLVED' || status === 'DISMISSED') return 'CLOSED';
  return 'PENDING';
}

/** EDD Nearing detail's own status vocabulary — statuses this card type
 * doesn't actually use fall back to PENDING. */
function toEddNearingDetailStatus(status: string): 'PENDING' | 'ACKNOWLEDGED' {
  return status === 'ACKNOWLEDGED' ? 'ACKNOWLEDGED' : 'PENDING';
}

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  let decoded: string;
  try {
    decoded = Buffer.from(cursor, 'base64url').toString('utf8');
  } catch {
    throw badRequest('cursor: Invalid cursor.');
  }
  const [createdAtIso, id] = decoded.split('|');
  const createdAt = createdAtIso ? new Date(createdAtIso) : null;
  if (!createdAt || Number.isNaN(createdAt.getTime()) || !id) {
    throw badRequest('cursor: Invalid cursor.');
  }
  return { createdAt, id };
}

function encodeCursor(row: { createdAt: Date; id: string }): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`, 'utf8').toString('base64url');
}

type EscalationEventRow = NonNullable<Awaited<ReturnType<EscalationRepository['findById']>>>;

interface RowEnrichment {
  beneficiary: BeneficiaryRecord | null;
  sakhi: SakhiRecord | null;
}

/** Escalation event domain logic. Data access is delegated to the repository. */
export class EscalationService {
  constructor(
    private readonly repository: EscalationRepository,
    private readonly notificationRepository: NotificationRepository,
    private readonly beneficiaryClient: BeneficiaryClient = new BeneficiaryClient(),
    private readonly managerNoticeClient: ManagerNoticeClient = new ManagerNoticeClient(),
    private readonly lookupClient: LookupClient = new LookupClient(),
    private readonly sakhiClient: SakhiClient = new SakhiClient(),
  ) {}

  /**
   * Resolves beneficiary + Sakhi details for the Supervisor app's card view
   * (SRS FR-SV-4.3 / PRD lines 143-150 — a card must show a name, not a bare
   * id). Best-effort per unique beneficiary/Sakhi: a page of up to 100 cards
   * shouldn't 502 in full because one referenced beneficiary record is gone —
   * that row's enrichment fields just come back null instead.
   */
  private async enrichRows(
    rows: EscalationEventRow[],
    authorizationHeader: string,
  ): Promise<Map<string, RowEnrichment>> {
    const beneficiaryIds = [...new Set(rows.map((row) => row.beneficiaryId))];
    const beneficiaries = new Map(
      await Promise.all(
        beneficiaryIds.map(async (id) => {
          try {
            return [id, await this.beneficiaryClient.getById(id, authorizationHeader)] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      ),
    );

    const sakhiIds = [
      ...new Set(
        [...beneficiaries.values()]
          .map((beneficiary) => beneficiary?.sakhiId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const sakhis = new Map(
      await Promise.all(
        sakhiIds.map(async (id) => {
          try {
            return [id, await this.sakhiClient.findById(id, authorizationHeader)] as const;
          } catch {
            return [id, null] as const;
          }
        }),
      ),
    );

    const result = new Map<string, RowEnrichment>();
    for (const row of rows) {
      const beneficiary = beneficiaries.get(row.beneficiaryId) ?? null;
      const sakhi = beneficiary?.sakhiId ? (sakhis.get(beneficiary.sakhiId) ?? null) : null;
      result.set(row.beneficiaryId, { beneficiary, sakhi });
    }
    return result;
  }

  /**
   * Quick Response's existing card fields (cardId/cardType/cardSource/
   * raisedAt/...) are kept as-is — approval-service's merged card list
   * depends on them for sort/pagination/dispatch. Beneficiary/Sakhi/risk
   * fields are additive, sourced from beneficiary-service and auth-service
   * (this table carries none of them itself — see the forklift rule).
   */
  private toEnrichedCard(
    row: EscalationEventRow,
    cardType: 'MISSED_VISIT' | 'EDD_NEARING',
    enrichment: RowEnrichment | null,
  ) {
    return {
      cardId: row.id,
      cardType,
      cardSource: 'escalation_events' as const,
      beneficiaryId: row.beneficiaryId,
      beneficiaryName: enrichment?.beneficiary?.pii.fullName ?? null,
      beneficiaryPhone: enrichment?.beneficiary?.pii.mobileNumber ?? null,
      riskLevel: enrichment?.beneficiary?.riskLevel ?? null,
      assignedSupervisorId: row.assignedSupervisorId,
      sakhiId: enrichment?.beneficiary?.sakhiId ?? null,
      sakhiName: enrichment?.sakhi?.displayName ?? null,
      sakhiContact: enrichment?.sakhi?.mobileNumber ?? null,
      visitId: row.visitId,
      referralId: row.referralId,
      escalationType: row.escalationType,
      status: row.status,
      resolvedAt: row.resolvedAt ? row.resolvedAt.toISOString() : null,
      actionTaken: row.actionTaken,
      raisedAt: row.createdAt.toISOString(),
    };
  }

  async list(query: ListEscalationEventsInput, authorizationHeader: string) {
    const cursor = query.cursor ? decodeCursor(query.cursor) : null;
    const rows = await this.repository.findMany(query, cursor);

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? encodeCursor(page[page.length - 1]) : null;

    const supported = page
      .map((row) => ({ row, cardType: toCardType(row.escalationType) }))
      .filter(
        (r): r is { row: (typeof page)[number]; cardType: 'MISSED_VISIT' | 'EDD_NEARING' } =>
          r.cardType !== null,
      );

    const enrichment = await this.enrichRows(
      supported.map(({ row }) => row),
      authorizationHeader,
    );

    const cards = supported.map(({ row, cardType }) =>
      this.toEnrichedCard(row, cardType, enrichment.get(row.beneficiaryId) ?? null),
    );

    return { cards, nextCursor };
  }

  /**
   * Raises a new escalation event. ADMIN-only (see escalation.routes.ts) —
   * in production these rows come from an automated rules/cron process, so
   * there is no Sakhi-ownership check to delegate here, unlike closures/
   * reopen-requests/referrals.
   */
  create(input: CreateEscalationEventInput, createdByUserId: string) {
    return this.repository.create(input, createdByUserId);
  }

  /**
   * Fetches a single escalation event shaped as an enriched Quick Response
   * card, or null if it doesn't exist (or isn't one of the 8 supported card
   * types). Unlike list()'s best-effort enrichment, a beneficiary/Sakhi
   * lookup failure here propagates — for a single card the enrichment IS
   * the payload, same philosophy as getEddNearingDetail.
   */
  async findById(id: string, authorizationHeader: string) {
    const row = await this.repository.findById(id);
    if (!row) return null;

    const cardType = toCardType(row.escalationType);
    if (!cardType) return null;

    const beneficiary = await this.beneficiaryClient.getById(
      row.beneficiaryId,
      authorizationHeader,
    );
    const sakhi = beneficiary.sakhiId
      ? await this.sakhiClient.findById(beneficiary.sakhiId, authorizationHeader)
      : null;

    return this.toEnrichedCard(row, cardType, { beneficiary, sakhi });
  }

  /**
   * Fetches a Missed Visit Escalation's own detail — the fields Quick
   * Response's generic card resolution doesn't already cover
   * (visitsMissedCount, visitType). 422s for an id that resolves but isn't
   * one of the 10 missed-visit escalation types, matching decideMissedVisit's
   * own guard.
   */
  async getMissedVisitDetail(id: string) {
    const row = await this.repository.findById(id);
    if (!row) throw notFound('Missed Visit Escalation not found.');
    if (!MISSED_VISIT_TYPES.has(row.escalationType)) {
      throw unprocessable('This endpoint only returns Missed Visit Escalation cards.');
    }

    return {
      id: row.id,
      beneficiaryId: row.beneficiaryId,
      visitsMissedCount: row.visitsMissedCount,
      visitType: MISSED_VISIT_TYPE_MAP[row.escalationType],
      requestedAt: row.createdAt.toISOString(),
      status: toMissedVisitDetailStatus(row.status),
    };
  }

  /**
   * Fetches an EDD Nearing card's own detail — the fields Quick Response's
   * generic card resolution doesn't already cover (eddDate, reason). eddDate
   * lives in beneficiary-service, not on this row, so it's resolved via a
   * cross-service call (same BeneficiaryClient decideMissedVisit already
   * uses) rather than swallowed on failure — unlike that best-effort notify,
   * eddDate/reason are this response's actual payload, so a beneficiary-
   * service failure here propagates instead of degrading silently.
   */
  async getEddNearingDetail(id: string, authorizationHeader: string) {
    const row = await this.repository.findById(id);
    if (!row) throw notFound('EDD Nearing request not found.');
    if (row.escalationType !== 'EDD_NEARING') {
      throw unprocessable('This endpoint only returns EDD Nearing cards.');
    }

    const beneficiary = await this.beneficiaryClient.getById(
      row.beneficiaryId,
      authorizationHeader,
    );
    const eddDate = beneficiary.motherCaseDetails?.eddDate?.slice(0, 10) ?? null;

    return {
      id: row.id,
      beneficiaryId: row.beneficiaryId,
      eddDate,
      reason: eddDate ? `EDD approaching on ${eddDate}` : null,
      requestedAt: row.createdAt.toISOString(),
      status: toEddNearingDetailStatus(row.status),
    };
  }

  /**
   * Acknowledges an EDD Nearing card — the only action it supports (no
   * reject path, no reason code, and per SRS no Sakhi notification).
   * OPEN -> ACKNOWLEDGED, conditional on still being OPEN so a second
   * acknowledge attempt 409s instead of silently no-op'ing — same guard
   * shape as every other service's own decide().
   */
  async acknowledgeEddNearing(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Escalation event not found.');
    if (existing.escalationType !== 'EDD_NEARING') {
      throw unprocessable('This endpoint only acknowledges EDD_NEARING escalations.');
    }
    if (existing.status !== 'OPEN') {
      throw conflict('This EDD Nearing card has already been decided.');
    }

    const updated = await this.repository.updateStatus(id, 'OPEN', 'ACKNOWLEDGED', null);
    if (!updated) {
      // Raced with another decision between the read above and the
      // conditional update — same outcome as the check above, just caught a
      // beat later instead of trusting a stale read.
      throw conflict('This EDD Nearing card has already been decided.');
    }

    return this.repository.findById(id);
  }

  /**
   * Decides a Missed Visit Escalation card. CLOSE resolves the escalation
   * and notifies the Sakhi to fill the closure form (best-effort, logged
   * not thrown — the decision above is already committed, same tolerance
   * every other service's post-decision notify call uses). TRANSFER (FR-SV-4.3)
   * is delegated to missed-visit-transfer.ts's decideTransfer — its own
   * three-way best-effort fan-out (roster removal, Manager email, Sakhi
   * notification) is substantial enough to keep out of this file.
   */
  async decideMissedVisit(id: string, action: 'TRANSFER' | 'CLOSE', authorizationHeader: string) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Escalation event not found.');
    if (!MISSED_VISIT_TYPES.has(existing.escalationType)) {
      throw unprocessable('This endpoint only decides Missed Visit Escalation cards.');
    }
    if (existing.status !== 'OPEN') {
      throw conflict('This Missed Visit Escalation card has already been decided.');
    }

    // Delegates ownership scoping to beneficiary-service's own GET /beneficiaries/:id
    // (SAKHI-own-case / SUPERVISOR-roster / MANAGER-unrestricted) — same pattern
    // submitClosurePendingReason already uses. Without this, a Supervisor could
    // decide (TRANSFER or CLOSE) an escalation outside their own roster (IDOR).
    await this.beneficiaryClient.getById(existing.beneficiaryId, authorizationHeader);

    if (action === 'TRANSFER') {
      return decideTransfer(
        existing,
        {
          repository: this.repository,
          notificationRepository: this.notificationRepository,
          beneficiaryClient: this.beneficiaryClient,
          managerNoticeClient: this.managerNoticeClient,
          sakhiClient: this.sakhiClient,
        },
        authorizationHeader,
      );
    }

    const updated = await this.repository.updateStatus(id, 'OPEN', 'RESOLVED', 'CLOSE');
    if (!updated) {
      throw conflict('This Missed Visit Escalation card has already been decided.');
    }

    try {
      const beneficiary = await this.beneficiaryClient.getById(
        existing.beneficiaryId,
        authorizationHeader,
      );
      const notificationDto = {
        recipientUserId: beneficiary.sakhiId,
        notificationType: 'MISSED_VISIT_ESCALATION' as const,
        title: 'Closure form needed',
        body: 'A beneficiary with a missed-visit escalation needs a closure form filled in.',
        priority: 5,
        linkedEntityType: 'EscalationEvent',
        linkedEntityId: id,
        status: 'UNREAD' as const,
      };
      await this.notificationRepository.create(notificationDto);
      await fanOutToSupervisor(
        this.notificationRepository,
        this.sakhiClient,
        notificationDto,
        authorizationHeader,
      );
    } catch (err) {
      console.error(
        `Missed Visit Escalation ${id} was closed but notifying the Sakhi failed:`,
        err,
      );
    }

    return this.repository.findById(id);
  }

  /**
   * A beneficiary's active Missed Visit Escalation TRANSFER review window
   * (FR-SV-4.3), if any — called by visit-form-service's own SUPERVISOR-only
   * notMetReason gate. "Active" means a TRANSFER_REQUESTED row whose
   * reviewDeadlineAt hasn't passed yet, not merely that one exists — the
   * window is time-bounded, not just status-bounded.
   */
  async getActiveTransferWindow(beneficiaryId: string) {
    const row = await this.repository.findActiveTransferWindow(beneficiaryId);
    if (!row?.reviewDeadlineAt || row.reviewDeadlineAt.getTime() <= Date.now()) {
      return { active: false, reviewDeadlineAt: null };
    }
    return { active: true, reviewDeadlineAt: row.reviewDeadlineAt.toISOString() };
  }

  /**
   * Records why a still-OPEN CLOSURE_PENDING escalation hasn't had its
   * closure form submitted yet — does not change status (the actual
   * closure/decision flow is separate). SAKHI-only (see escalation.routes.ts);
   * ownership is delegated to beneficiary-service's own GET /beneficiaries/:id
   * (SAKHI-own-case check), same trust-delegation as closure-reopen-service's
   * ClosureService.create — this service owns no sakhiId data of its own.
   */
  async submitClosurePendingReason(
    id: string,
    input: SubmitClosurePendingReasonInput,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Escalation event not found.');
    if (existing.escalationType !== 'CLOSURE_PENDING') {
      throw unprocessable('This endpoint only accepts CLOSURE_PENDING escalations.');
    }

    await this.beneficiaryClient.getById(existing.beneficiaryId, authorizationHeader);

    const reasonCode = await this.lookupClient.resolveClosurePendingReasonCode(
      input.pendingReasonLookupValueId,
      authorizationHeader,
    );
    if (!reasonCode) {
      throw badRequest('pendingReasonLookupValueId: Unrecognized CLOSURE_PENDING_REASON value.');
    }
    if (reasonCode === 'OTHER' && !input.notes) {
      throw badRequest('notes: Required when the reason is OTHER.');
    }

    const updated = await this.repository.updatePendingReason(
      id,
      input.pendingReasonLookupValueId,
      input.notes ?? null,
    );
    if (!updated) {
      throw conflict('This CLOSURE_PENDING escalation is no longer open.');
    }

    return this.repository.findById(id);
  }
}
