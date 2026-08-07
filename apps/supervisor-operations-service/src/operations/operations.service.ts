import { HttpError, conflict, forbidden, notFound, unprocessable } from '@armman/service-commons';
import type { OperationsRepository } from './operations.repository';
import type { CreateSupervisorEventInput } from './dto/create-supervisorEvent.dto';
import type { ListSupervisorEventsQuery } from './dto/list-supervisor-events.dto';
import type { UpdateAttendanceInput } from './dto/update-attendance.dto';
import type { CreateInventoryItemInput } from './dto/create-inventory-item.dto';
import type { CreateInventoryTransactionInput } from './dto/create-inventory-transaction.dto';
import type { UpdateInventoryTransactionInput } from './dto/update-inventory-transaction.dto';
import type { CreateCallLogInput } from './dto/create-call-log.dto';
import type { UpdateCallLogInput } from './dto/update-call-log.dto';
import type { CreateTrainingTopicInput } from './dto/create-training-topic.dto';
import type { RescheduleEventInput } from './dto/reschedule-event.dto';
import type { CreateEventPhotoInput } from './dto/create-event-photo.dto';
import type { CreateGatheringInput } from './dto/create-gathering.dto';
import type { UpdateGatheringAttendanceInput } from './dto/update-gathering-attendance.dto';
import type { CompleteTopicMarkInput, CreateTopicMarkInput } from './dto/create-topic-mark.dto';
import type { TopicMarkQuery } from './dto/topic-mark-query.dto';
import type { CallSheetStatKind } from './dto/call-sheet-stats.dto';
import { CALL_SHEET_STAT_KINDS } from './dto/call-sheet-stats.dto';
import type { SakhiClient } from './sakhi.client';

/** Default recency window for the FR-SV-3.4 "recently called" card highlight. */
const DEFAULT_RECENT_CALL_WINDOW_HOURS = 72;

/** Prisma unique-constraint violation code (itemCode). */
const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

/** Narrows a caught Prisma error to a unique-constraint violation (P2002). */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === PRISMA_UNIQUE_CONSTRAINT_CODE
  );
}

/** The calling principal's own identity, as carried on their trusted-identity headers. */
export interface CallerIdentity {
  readonly id: string;
  readonly roles: readonly string[];
}

/** MANAGER and ADMIN are unrestricted across all inventory ownership checks. */
function isPrivileged(caller: CallerIdentity): boolean {
  return caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
}

/** Today's date as YYYY-MM-DD, for call-sheet-stats' lastDataSyncDate. */
function todayDateOnly(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Builds all 7 call-sheet-stats rows in the fixed kind order. Only
 * FOLLOWUP_PENDING carries a real count; every other kind is a
 * { count: 0, updated: 0 } placeholder — see call-sheet-stats.dto.ts.
 */
function buildCallSheetStatRows(
  pendingFollowups: number,
): Array<{ kind: CallSheetStatKind; updated: number; count: number }> {
  return CALL_SHEET_STAT_KINDS.map((kind) => ({
    kind,
    updated: 0,
    count: kind === 'FOLLOWUP_PENDING' ? pendingFollowups : 0,
  }));
}

/** Supervisor operations domain logic. Data access is delegated to the repository. */
export class OperationsService {
  constructor(
    private readonly repository: OperationsRepository,
    private readonly sakhiClient: SakhiClient,
  ) {}

  listEvents(filters?: ListSupervisorEventsQuery) {
    return this.repository.findEvents(filters);
  }

  async createEvent(dto: CreateSupervisorEventInput) {
    // The DTO's photoMediaId is application-mandatory when status = COMPLETED
    // (ERD §4.7) — the schema keeps it optional so SCHEDULED/CANCELLED events
    // can be created without a photo, so this rule is enforced here instead.
    if (dto.status === 'COMPLETED' && !dto.photoMediaId) {
      throw unprocessable('photoMediaId is required when status is COMPLETED.');
    }
    // A supervisor can't have two events at the same exact instant for the
    // same project — almost certainly a duplicate submission, not two real
    // meetings. Cancelled events don't block a re-create at that slot.
    const existingConflict = await this.repository.findConflictingEvent(
      dto.supervisorId,
      dto.projectId,
      dto.eventDate,
    );
    if (existingConflict) {
      throw conflict('An event for this supervisor and project already exists at this date/time.');
    }
    return this.repository.createEvent(dto);
  }

  /** A SUPERVISOR may only fetch their own events. MANAGER and ADMIN are unrestricted. */
  async getEvent(id: string, caller: CallerIdentity) {
    const event = await this.repository.findEventById(id);
    if (!event) throw notFound('Event not found.');
    if (event.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this event.');
    }
    return event;
  }

  /**
   * A SUPERVISOR may only cancel their own events. MANAGER and ADMIN are
   * unrestricted. Only a SCHEDULED event can be cancelled — SRS/ERD don't
   * state this explicitly, but cancelling an already-COMPLETED/CANCELLED
   * event has no meaningful effect and would silently discard history.
   */
  async cancelEvent(id: string, caller: CallerIdentity) {
    const existing = await this.repository.findEventById(id);
    if (!existing) throw notFound('Event not found.');
    if (existing.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this event.');
    }
    if (existing.status !== 'SCHEDULED') {
      throw conflict(`Cannot cancel an event with status ${existing.status}.`);
    }

    const updated = await this.repository.updateEventStatus(id, 'CANCELLED', caller.id);
    if (!updated) throw notFound('Event not found.');
    return updated;
  }

  /**
   * A SUPERVISOR may only complete their own events. MANAGER and ADMIN are
   * unrestricted. Only a SCHEDULED event can be completed. Per FR-SV-2.3
   * ("mark attendance for each Sakhi individually, upload at least one event
   * photo, and submit"), completion requires both a photo (existing rule,
   * mirrored from createEvent) and at least one attendance row already
   * recorded — a Supervisor can't submit completion before marking anyone.
   */
  async completeEvent(id: string, caller: CallerIdentity) {
    const existing = await this.repository.findEventById(id);
    if (!existing) throw notFound('Event not found.');
    if (existing.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this event.');
    }
    if (existing.status !== 'SCHEDULED') {
      throw conflict(`Cannot complete an event with status ${existing.status}.`);
    }
    if (!existing.photoMediaId) {
      throw unprocessable('photoMediaId is required to complete this event.');
    }

    const attendance = await this.repository.findAttendanceByEvent(id);
    if (attendance.length === 0) {
      throw unprocessable('At least one attendance record is required to complete this event.');
    }

    const updated = await this.repository.updateEventStatus(id, 'COMPLETED', caller.id);
    if (!updated) throw notFound('Event not found.');
    return updated;
  }

  /** A SUPERVISOR may only view their own events' attendance. MANAGER and ADMIN are unrestricted. */
  async getEventAttendance(id: string, caller: CallerIdentity) {
    const event = await this.repository.findEventById(id);
    if (!event) throw notFound('Event not found.');
    if (event.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this event.');
    }
    return this.repository.findAttendanceByEvent(id);
  }

  /**
   * A SUPERVISOR may only record attendance for their own events. MANAGER
   * and ADMIN are unrestricted. Upserts by (eventId, sakhiId) so repeated
   * submissions (e.g. corrections before completion) never create
   * duplicate rows for the same Sakhi.
   */
  async updateEventAttendance(id: string, dto: UpdateAttendanceInput, caller: CallerIdentity) {
    const event = await this.repository.findEventById(id);
    if (!event) throw notFound('Event not found.');
    if (event.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this event.');
    }
    return this.repository.upsertAttendance(id, dto.attendance, caller.id);
  }

  listInventoryItems() {
    return this.repository.findInventoryItems();
  }

  async createInventoryItem(dto: CreateInventoryItemInput, createdByUserId: string) {
    try {
      return await this.repository.createInventoryItem(dto, createdByUserId);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw conflict('An inventory item with this itemCode already exists.');
      }
      throw err;
    }
  }

  listInventoryTransactions() {
    return this.repository.findInventoryTransactions();
  }

  /**
   * A SUPERVISOR may only see a Sakhi's history if that Sakhi is actually
   * assigned to them (checked via auth-service, since sakhi_profiles isn't
   * this service's table — forklift rule). MANAGER and ADMIN are unrestricted.
   */
  async listInventoryTransactionsBySakhi(
    sakhiId: string,
    caller: CallerIdentity,
    authorizationHeader: string,
  ) {
    if (!isPrivileged(caller)) {
      const sakhi = await this.sakhiClient.findById(sakhiId, authorizationHeader);
      if (!sakhi) throw notFound('Sakhi not found.');
      if (sakhi.supervisorId !== caller.id) {
        throw forbidden('You do not have access to this Sakhi.');
      }
    }
    return this.repository.findInventoryTransactionsBySakhi(sakhiId);
  }

  /**
   * A SUPERVISOR may only record a transaction against a Sakhi actually
   * assigned to them — same ownership check as listInventoryTransactionsBySakhi,
   * so a Supervisor can't write inventory history onto another Supervisor's
   * Sakhi (MANAGER and ADMIN are exempt, matching the read path). Then
   * validates every referenced item exists and is ACTIVE before writing
   * anything (fails the whole submission up front rather than partway
   * through the atomic create), then persists one row per item.
   *
   * `supervisorId` is never taken from the client-supplied body — it's
   * always the authenticated caller's own id, so a Supervisor can never
   * record a transaction under another Supervisor's name. When a MANAGER or
   * ADMIN records one directly, the row is stamped with their own id too —
   * they aren't a real Supervisor, but every transaction needs a recorder,
   * and this still traces back to exactly who created it.
   */
  async createInventoryTransactions(
    dto: CreateInventoryTransactionInput,
    caller: CallerIdentity,
    authorizationHeader: string,
  ) {
    if (!isPrivileged(caller)) {
      const sakhi = await this.sakhiClient.findById(dto.sakhiId, authorizationHeader);
      if (!sakhi) throw unprocessable('sakhiId: Sakhi not found.');
      if (sakhi.supervisorId !== caller.id) {
        throw forbidden('You do not have access to this Sakhi.');
      }
    }

    for (const { itemId } of dto.items) {
      const item = await this.repository.findInventoryItemById(itemId);
      if (!item) throw unprocessable(`items: item ${itemId} not found.`);
      if (item.status !== 'ACTIVE') {
        throw unprocessable(`items: item ${itemId} is not active.`);
      }
    }

    const { items, ...header } = dto;
    const rows = items.map((item) => ({
      ...header,
      supervisorId: caller.id,
      itemId: item.itemId,
      quantity: item.quantity,
    }));
    return this.repository.createInventoryTransactions(rows, caller.id);
  }

  /** A SUPERVISOR may only edit their own transactions. MANAGER and ADMIN are unrestricted. */
  async updateInventoryTransaction(
    id: string,
    dto: UpdateInventoryTransactionInput,
    caller: CallerIdentity,
  ) {
    const existing = await this.repository.findInventoryTransactionById(id);
    if (!existing) throw notFound('Inventory transaction not found.');
    if (existing.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this transaction.');
    }

    const updated = await this.repository.updateInventoryTransaction(id, dto, caller.id);
    if (!updated) throw notFound('Inventory transaction not found.');
    return updated;
  }

  /** A SUPERVISOR may only delete their own transactions. MANAGER and ADMIN are unrestricted. */
  async deleteInventoryTransaction(id: string, caller: CallerIdentity) {
    const existing = await this.repository.findInventoryTransactionById(id);
    if (!existing) throw notFound('Inventory transaction not found.');
    if (existing.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this transaction.');
    }

    const deleted = await this.repository.softDeleteInventoryTransaction(id, caller.id);
    if (!deleted) throw notFound('Inventory transaction not found.');
  }

  /** A SUPERVISOR may only see their own call logs. MANAGER and ADMIN are unrestricted. */
  listCallLogs(caller: CallerIdentity) {
    return this.repository.findCallLogs(isPrivileged(caller) ? undefined : caller.id);
  }

  /**
   * A SUPERVISOR may only log a call against a Sakhi actually assigned to
   * them — same ownership check as createInventoryTransactions. `supervisorId`
   * is never taken from the client-supplied body — it's always the
   * authenticated caller's own id.
   */
  async createCallLog(
    dto: CreateCallLogInput,
    caller: CallerIdentity,
    authorizationHeader: string,
  ) {
    if (!isPrivileged(caller)) {
      const sakhi = await this.sakhiClient.findById(dto.sakhiId, authorizationHeader);
      if (!sakhi) throw unprocessable('sakhiId: Sakhi not found.');
      if (sakhi.supervisorId !== caller.id) {
        throw forbidden('You do not have access to this Sakhi.');
      }
    }
    return this.repository.createCallLog({ ...dto, supervisorId: caller.id }, caller.id);
  }

  /** A SUPERVISOR may only view their own call logs. MANAGER and ADMIN are unrestricted. */
  async getCallLog(id: string, caller: CallerIdentity) {
    const existing = await this.repository.findCallLogById(id);
    if (!existing) throw notFound('Call log not found.');
    if (existing.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this call log.');
    }
    return existing;
  }

  /** A SUPERVISOR may only edit their own call logs. MANAGER and ADMIN are unrestricted. */
  async updateCallLog(id: string, dto: UpdateCallLogInput, caller: CallerIdentity) {
    const existing = await this.repository.findCallLogById(id);
    if (!existing) throw notFound('Call log not found.');
    if (existing.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this call log.');
    }
    // callStartAt is immutable (see updateCallLogSchema), so this is the only
    // place the ordering can be checked against the record's actual start time.
    if (dto.callEndAt && dto.callEndAt.getTime() < existing.callStartAt.getTime()) {
      throw unprocessable('callEndAt must not be before callStartAt.');
    }

    const updated = await this.repository.updateCallLog(id, dto, caller.id);
    if (!updated) throw notFound('Call log not found.');
    return updated;
  }

  /**
   * A SUPERVISOR may only see a Sakhi's call history if that Sakhi is
   * actually assigned to them (checked via auth-service, since
   * sakhi_profiles isn't this service's table — forklift rule). MANAGER and
   * ADMIN are unrestricted.
   */
  async listCallLogsBySakhi(sakhiId: string, caller: CallerIdentity, authorizationHeader: string) {
    if (!isPrivileged(caller)) {
      const sakhi = await this.sakhiClient.findById(sakhiId, authorizationHeader);
      if (!sakhi) throw notFound('Sakhi not found.');
      if (sakhi.supervisorId !== caller.id) {
        throw forbidden('You do not have access to this Sakhi.');
      }
    }
    return this.repository.findCallLogsBySakhi(sakhiId);
  }

  /**
   * Whether a Sakhi has been called within `withinHours` (FR-SV-3.4's
   * orange-highlight card state). Same ownership rule as listCallLogsBySakhi.
   */
  async listRecentCallLogsBySakhi(
    sakhiId: string,
    caller: CallerIdentity,
    authorizationHeader: string,
    withinHours: number = DEFAULT_RECENT_CALL_WINDOW_HOURS,
  ) {
    if (!isPrivileged(caller)) {
      const sakhi = await this.sakhiClient.findById(sakhiId, authorizationHeader);
      if (!sakhi) throw notFound('Sakhi not found.');
      if (sakhi.supervisorId !== caller.id) {
        throw forbidden('You do not have access to this Sakhi.');
      }
    }
    const sinceDate = new Date(Date.now() - withinHours * 60 * 60 * 1000);
    return this.repository.findRecentCallLogsBySakhi(sakhiId, sinceDate);
  }

  /**
   * A Sakhi's call-sheet stats card: 7 fixed "kind" rows. Only
   * FOLLOWUP_PENDING is real today — the other 6 need data models that
   * either don't exist yet or live in other services (visit schedules,
   * closure forms, ANC/PNC risk state); they're returned as a fixed
   * { count: 0, updated: 0 } placeholder until that's scoped, rather than
   * omitted, so the card's row layout doesn't have to special-case a
   * missing kind. Same ownership rule as listCallLogsBySakhi.
   */
  async getCallSheetStats(sakhiId: string, caller: CallerIdentity, authorizationHeader: string) {
    const sakhi = await this.sakhiClient.findById(sakhiId, authorizationHeader);
    if (!sakhi) throw notFound('Sakhi not found.');
    if (!isPrivileged(caller) && sakhi.supervisorId !== caller.id) {
      throw forbidden('You do not have access to this Sakhi.');
    }

    const pendingFollowups = await this.repository.countPendingFollowups(sakhiId);
    return {
      sakhiId,
      lastDataSyncDate: todayDateOnly(),
      rows: buildCallSheetStatRows(pendingFollowups),
    };
  }

  /**
   * Batch variant of getCallSheetStats for a list-view's card grid, so the
   * caller isn't forced into one request per Sakhi card. A sakhiId that is
   * unknown (404) or not assigned to the caller (403) is silently omitted
   * from the result — the caller's other, legitimate cards should still
   * render. Anything else (e.g. a badGateway 502 from sakhiClient if
   * auth-service is unreachable) propagates and fails the whole batch,
   * rather than being swallowed and rendered as an indistinguishable "no
   * card" — a real infra failure on one id should surface, not masquerade
   * as an empty result.
   */
  async getCallSheetStatsBatch(
    sakhiIds: string[],
    caller: CallerIdentity,
    authorizationHeader: string,
  ) {
    const results = await Promise.all(
      sakhiIds.map(async (sakhiId) => {
        try {
          return await this.getCallSheetStats(sakhiId, caller, authorizationHeader);
        } catch (err) {
          if (err instanceof HttpError && (err.status === 403 || err.status === 404)) {
            return null;
          }
          throw err;
        }
      }),
    );
    return results.filter((r): r is NonNullable<typeof r> => r !== null);
  }

  listTrainingTopics() {
    return this.repository.findTrainingTopics();
  }

  async createTrainingTopic(dto: CreateTrainingTopicInput, createdByUserId: string) {
    try {
      return await this.repository.createTrainingTopic(dto, createdByUserId);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw conflict('A training topic with this topicCode already exists.');
      }
      throw err;
    }
  }

  /**
   * A SUPERVISOR may only reschedule their own events. MANAGER and ADMIN are
   * unrestricted. Only a SCHEDULED event can be rescheduled — matches
   * cancelEvent/completeEvent's existing rule that a COMPLETED/CANCELLED
   * event's history is immutable.
   */
  async rescheduleEvent(id: string, dto: RescheduleEventInput, caller: CallerIdentity) {
    const existing = await this.repository.findEventById(id);
    if (!existing) throw notFound('Event not found.');
    if (existing.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this event.');
    }
    if (existing.status !== 'SCHEDULED') {
      throw conflict(`Cannot reschedule an event with status ${existing.status}.`);
    }

    const updated = await this.repository.rescheduleEvent(id, dto, caller.id);
    if (!updated) throw notFound('Event not found.');
    return updated;
  }

  /**
   * A SUPERVISOR may only add photos to their own events. MANAGER and ADMIN
   * are unrestricted. Per FR (Meeting & Training Flow #3), a photo may be
   * added any time before completion — COMPLETED/CANCELLED events are
   * closed to further edits, matching every other post-terminal-status rule
   * in this service.
   */
  async addEventPhoto(id: string, dto: CreateEventPhotoInput, caller: CallerIdentity) {
    const event = await this.repository.findEventById(id);
    if (!event) throw notFound('Event not found.');
    if (event.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this event.');
    }
    if (event.status !== 'SCHEDULED') {
      throw conflict(`Cannot add a photo to an event with status ${event.status}.`);
    }
    return this.repository.createEventPhoto(id, dto.mediaId, caller.id);
  }

  /**
   * A SUPERVISOR may only add a gathering (Training session) to their own
   * events. MANAGER and ADMIN are unrestricted. Gatherings are a
   * TRAINING-only concept — creating one on a MEETING event is rejected.
   * Every referenced topicId must resolve to an ACTIVE training_topics row;
   * any that don't are reported back together rather than one at a time.
   */
  async createGathering(eventId: string, dto: CreateGatheringInput, caller: CallerIdentity) {
    const event = await this.repository.findEventById(eventId);
    if (!event) throw notFound('Event not found.');
    if (event.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this event.');
    }
    if (event.eventType !== 'TRAINING') {
      throw unprocessable('Gatherings can only be created for TRAINING events.');
    }

    const activeIds = await this.repository.findActiveTrainingTopicIds(dto.topicIds);
    const missingOrInactive = dto.topicIds.filter((id) => !activeIds.includes(id));
    if (missingOrInactive.length > 0) {
      throw unprocessable(
        `topicIds: the following topics do not exist or are not active: ${missingOrInactive.join(', ')}.`,
      );
    }

    return this.repository.createGathering(eventId, dto, caller.id);
  }

  /**
   * A SUPERVISOR may only view topics for a gathering under their own
   * event. MANAGER and ADMIN are unrestricted. Ownership is derived via the
   * gathering's parent event, since gatherings carry no supervisorId of
   * their own.
   */
  async listGatheringTopics(gatheringId: string, caller: CallerIdentity) {
    const gathering = await this.repository.findGatheringById(gatheringId);
    if (!gathering) throw notFound('Gathering not found.');
    const event = await this.repository.findEventById(gathering.eventId);
    if (!event) throw notFound('Event not found.');
    if (event.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this gathering.');
    }
    return this.repository.findGatheringTopics(gatheringId);
  }

  /** A SUPERVISOR may only view attendance for a gathering under their own event. MANAGER and ADMIN are unrestricted. */
  async getGatheringAttendance(gatheringId: string, caller: CallerIdentity) {
    const gathering = await this.repository.findGatheringById(gatheringId);
    if (!gathering) throw notFound('Gathering not found.');
    const event = await this.repository.findEventById(gathering.eventId);
    if (!event) throw notFound('Event not found.');
    if (event.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this gathering.');
    }
    return this.repository.findGatheringAttendance(gatheringId);
  }

  /**
   * A SUPERVISOR may only record attendance for a gathering under their own
   * event. MANAGER and ADMIN are unrestricted. Upserts by
   * (gatheringId, sakhiId) so repeated submissions never create duplicate
   * rows for the same Sakhi.
   */
  async updateGatheringAttendance(
    gatheringId: string,
    dto: UpdateGatheringAttendanceInput,
    caller: CallerIdentity,
  ) {
    const gathering = await this.repository.findGatheringById(gatheringId);
    if (!gathering) throw notFound('Gathering not found.');
    const event = await this.repository.findEventById(gathering.eventId);
    if (!event) throw notFound('Event not found.');
    if (event.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this gathering.');
    }
    return this.repository.upsertGatheringAttendance(gatheringId, dto.attendance, caller.id);
  }

  /**
   * A SUPERVISOR may only view marks for a gathering under their own event.
   * MANAGER and ADMIN are unrestricted. Returns 404 if no mark has been
   * recorded yet for this (gathering, topic, sakhi, type) combination —
   * matching this service's "not found" convention for a genuinely absent
   * record, rather than a 200 with an empty/null body.
   */
  async getTopicMark(topicId: string, query: TopicMarkQuery, caller: CallerIdentity) {
    const gathering = await this.repository.findGatheringById(query.gatheringId);
    if (!gathering) throw notFound('Gathering not found.');
    const event = await this.repository.findEventById(gathering.eventId);
    if (!event) throw notFound('Event not found.');
    if (event.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this gathering.');
    }

    const mark = await this.repository.findTopicMark(
      query.gatheringId,
      topicId,
      query.sakhiId,
      query.type,
    );
    if (!mark) throw notFound('Mark not found.');
    return mark;
  }

  /**
   * A SUPERVISOR may only save marks for a gathering under their own event.
   * MANAGER and ADMIN are unrestricted. The referenced topic must actually
   * belong to the gathering (via gathering_topics) — otherwise a Supervisor
   * could score a topic never selected for this session. Rejects with 409
   * if the mark is already locked via completeTopicMark — there is no
   * unlock endpoint, so a locked mark is immutable from here on.
   */
  async upsertTopicMark(topicId: string, dto: CreateTopicMarkInput, caller: CallerIdentity) {
    const gathering = await this.repository.findGatheringById(dto.gatheringId);
    if (!gathering) throw notFound('Gathering not found.');
    const event = await this.repository.findEventById(gathering.eventId);
    if (!event) throw notFound('Event not found.');
    if (event.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this gathering.');
    }

    const gatheringTopics = await this.repository.findGatheringTopics(dto.gatheringId);
    const belongsToGathering = gatheringTopics.some(
      (gt: (typeof gatheringTopics)[number]) => gt.topicId === topicId,
    );
    if (!belongsToGathering) {
      throw unprocessable('topicId: this topic is not part of the referenced gathering.');
    }

    const existing = await this.repository.findTopicMark(
      dto.gatheringId,
      topicId,
      dto.sakhiId,
      dto.markType,
    );
    if (existing?.isLocked) {
      throw conflict('This mark is locked and can no longer be edited.');
    }

    return this.repository.upsertTopicMark(
      dto.gatheringId,
      topicId,
      dto.sakhiId,
      dto.markType,
      dto.score,
      caller.id,
    );
  }

  /**
   * A SUPERVISOR may only lock marks for a gathering under their own event.
   * MANAGER and ADMIN are unrestricted. 404 if no mark exists yet to lock —
   * a Supervisor must submit a score via PUT before it can be completed.
   * 409 if already locked — idempotency protection, matching
   * cancelEvent/completeEvent's one-way status-transition pattern.
   */
  async completeTopicMark(topicId: string, dto: CompleteTopicMarkInput, caller: CallerIdentity) {
    const gathering = await this.repository.findGatheringById(dto.gatheringId);
    if (!gathering) throw notFound('Gathering not found.');
    const event = await this.repository.findEventById(gathering.eventId);
    if (!event) throw notFound('Event not found.');
    if (event.supervisorId !== caller.id && !isPrivileged(caller)) {
      throw forbidden('You do not have access to this gathering.');
    }

    const mark = await this.repository.findTopicMark(
      dto.gatheringId,
      topicId,
      dto.sakhiId,
      dto.markType,
    );
    if (!mark) throw notFound('Mark not found.');
    if (mark.isLocked) {
      throw conflict('This mark is already locked.');
    }

    return this.repository.lockTopicMark(mark.id, caller.id);
  }
}
