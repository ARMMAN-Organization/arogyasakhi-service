import type { PrismaService } from '../prisma/prisma.service';
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
import type { UpdateGatheringAttendanceInput } from './dto/update-gathering-attendance.dto';
import type { ListGatheringsQuery } from './dto/list-gatherings.dto';

/**
 * Data access for supervisor operations. Owns only this service's tables
 * (supervisor_events, event_attendance, inventory_items, inventory_transactions,
 * call_logs) — no cross-service joins (forklift rule).
 */
export class OperationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findEvents(filters: ListSupervisorEventsQuery = {}) {
    return this.prisma.supervisorEvent.findMany({
      where: {
        isDeleted: false,
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.eventType ? { eventType: filters.eventType } : {}),
      },
      orderBy: { eventDate: 'desc' },
      take: 50,
    });
  }

  createEvent(data: CreateSupervisorEventInput & { supervisorId: string }) {
    return this.prisma.supervisorEvent.create({ data });
  }

  /** An existing, non-cancelled event for this supervisor+project at the exact same eventDate, if any. */
  findConflictingEvent(supervisorId: string, projectId: string, eventDate: Date) {
    return this.prisma.supervisorEvent.findFirst({
      where: {
        supervisorId,
        projectId,
        eventDate,
        isDeleted: false,
        status: { not: 'CANCELLED' },
      },
    });
  }

  findEventById(id: string) {
    return this.prisma.supervisorEvent.findFirst({ where: { id, isDeleted: false } });
  }

  async updateEventStatus(id: string, status: 'COMPLETED' | 'CANCELLED', updatedByUserId: string) {
    const existing = await this.findEventById(id);
    if (!existing) return null;

    return this.prisma.supervisorEvent.update({
      where: { id },
      data: { status, updatedByUserId },
    });
  }

  /** All attendance rows for one event (FR-SV-2.1/2.3/2.4), excluding soft-deleted. */
  findAttendanceByEvent(eventId: string) {
    return this.prisma.eventAttendance.findMany({
      where: { eventId, isDeleted: false },
    });
  }

  /**
   * Upserts one row per Sakhi in the submission, keyed by (eventId, sakhiId)
   * — there is no DB unique constraint on that pair, so `prisma.upsert`
   * (which requires a real unique-input shape) can't be used directly. This
   * finds the existing row (if any) for each pair first, then updates or
   * creates inside one transaction, so a partial failure never leaves the
   * attendance sheet half-written for one submit, and repeated PUTs of the
   * same event's attendance (e.g. a Supervisor re-submitting after a
   * correction) never produce duplicate rows.
   */
  async upsertAttendance(
    eventId: string,
    entries: UpdateAttendanceInput['attendance'],
    userId: string,
  ) {
    const existingRows = await this.prisma.eventAttendance.findMany({
      where: { eventId, isDeleted: false, sakhiId: { in: entries.map((e) => e.sakhiId) } },
    });
    const existingBySakhiId = new Map(existingRows.map((row) => [row.sakhiId, row]));

    return this.prisma.$transaction(
      entries.map((entry) => {
        const existing = existingBySakhiId.get(entry.sakhiId);
        const data = {
          attendanceStatus: entry.attendanceStatus,
          preTrainingScore: entry.preTrainingScore ?? null,
          postTrainingScore: entry.postTrainingScore ?? null,
          remarks: entry.remarks ?? null,
        };

        return existing
          ? this.prisma.eventAttendance.update({
              where: { id: existing.id },
              data: { ...data, updatedByUserId: userId },
            })
          : this.prisma.eventAttendance.create({
              data: {
                eventId,
                sakhiId: entry.sakhiId,
                ...data,
                createdByUserId: userId,
                updatedByUserId: userId,
              },
            });
      }),
    );
  }

  findInventoryItems() {
    return this.prisma.inventoryItem.findMany({
      where: { isDeleted: false },
      orderBy: { itemName: 'asc' },
      take: 100,
    });
  }

  createInventoryItem(data: CreateInventoryItemInput, createdByUserId: string) {
    return this.prisma.inventoryItem.create({
      data: { ...data, createdByUserId, updatedByUserId: createdByUserId },
    });
  }

  findInventoryTransactions() {
    return this.prisma.inventoryTransaction.findMany({
      where: { isDeleted: false },
      orderBy: { transactionDate: 'desc' },
      take: 50,
    });
  }

  /** One Sakhi's transaction history (FR-SV-1.5), excluding soft-deleted. */
  findInventoryTransactionsBySakhi(sakhiId: string) {
    return this.prisma.inventoryTransaction.findMany({
      where: { sakhiId, isDeleted: false },
      orderBy: { transactionDate: 'desc' },
    });
  }

  findInventoryItemById(id: string) {
    return this.prisma.inventoryItem.findFirst({ where: { id, isDeleted: false } });
  }

  findInventoryTransactionById(id: string) {
    return this.prisma.inventoryTransaction.findFirst({ where: { id, isDeleted: false } });
  }

  /**
   * Creates one row per item in a single submission (FR-SV-1.1: "one or more
   * items"), atomically — either every row is created or none are, so a
   * partial failure never leaves the ledger half-written for one submit.
   */
  createInventoryTransactions(
    rows: Array<
      Omit<CreateInventoryTransactionInput, 'items'> & {
        supervisorId: string;
        itemId: string;
        quantity: number;
      }
    >,
    createdByUserId: string,
  ) {
    return this.prisma.$transaction(
      rows.map((row) =>
        this.prisma.inventoryTransaction.create({
          data: {
            projectId: row.projectId,
            supervisorId: row.supervisorId,
            sakhiId: row.sakhiId,
            itemId: row.itemId,
            transactionType: row.transactionType,
            quantity: row.quantity,
            transactionDate: row.transactionDate,
            remarks: row.remarks ?? null,
            createdByUserId,
            updatedByUserId: createdByUserId,
          },
        }),
      ),
    );
  }

  /**
   * Only ever writes the fields describing "what happened" (quantity, date,
   * remarks) — itemId/sakhiId/projectId/supervisorId/transactionType are
   * immutable, matching this repo's append-only-ledger convention.
   */
  async updateInventoryTransaction(
    id: string,
    data: UpdateInventoryTransactionInput,
    updatedByUserId: string,
  ) {
    const existing = await this.findInventoryTransactionById(id);
    if (!existing) return null;

    return this.prisma.inventoryTransaction.update({
      where: { id },
      data: { ...data, updatedByUserId },
    });
  }

  async softDeleteInventoryTransaction(id: string, updatedByUserId: string) {
    const existing = await this.findInventoryTransactionById(id);
    if (!existing) return null;

    return this.prisma.inventoryTransaction.update({
      where: { id },
      data: { isDeleted: true, deletedAt: new Date(), updatedByUserId },
    });
  }

  /** Recent call logs, scoped to one supervisor unless `supervisorId` is omitted (MANAGER/ADMIN). */
  findCallLogs(supervisorId?: string) {
    return this.prisma.callLog.findMany({
      where: { isDeleted: false, ...(supervisorId ? { supervisorId } : {}) },
      orderBy: { callDatetime: 'desc' },
      take: 50,
    });
  }

  createCallLog(data: CreateCallLogInput & { supervisorId: string }, createdByUserId: string) {
    return this.prisma.callLog.create({
      data: { ...data, createdByUserId, updatedByUserId: createdByUserId },
    });
  }

  findCallLogById(id: string) {
    return this.prisma.callLog.findFirst({ where: { id, isDeleted: false } });
  }

  /** One Sakhi's full call history (FR-SV-3.3), newest first, excluding soft-deleted. */
  findCallLogsBySakhi(sakhiId: string) {
    return this.prisma.callLog.findMany({
      where: { sakhiId, isDeleted: false },
      orderBy: { callDatetime: 'desc' },
    });
  }

  /** A Sakhi's calls within the last `sinceDate` (FR-SV-3.4 recency check), newest first. */
  findRecentCallLogsBySakhi(sakhiId: string, sinceDate: Date) {
    return this.prisma.callLog.findMany({
      where: { sakhiId, isDeleted: false, callDatetime: { gte: sinceDate } },
      orderBy: { callDatetime: 'desc' },
    });
  }

  /**
   * Call-sheet stats' FOLLOWUP_PENDING count — 1 if this Sakhi's most recent
   * call is still CALL_BACK (unresolved), 0 otherwise (including "never
   * called"). NOT a count of every CALL_BACK ever logged: call_logs has no
   * beneficiary/thread grouping (it's one Supervisor-to-Sakhi check-in call
   * per row, per FR-SV-3.3), so a later call of any status supersedes an
   * earlier CALL_BACK — it doesn't stay "pending" once the Supervisor has
   * called again, whatever the outcome of that later call. The only one of
   * the 7 call-sheet-stats kinds backed by real data today.
   */
  async countPendingFollowups(sakhiId: string): Promise<number> {
    const latest = await this.prisma.callLog.findFirst({
      where: { sakhiId, isDeleted: false },
      orderBy: { callDatetime: 'desc' },
      select: { callStatus: true },
    });
    return latest?.callStatus === 'CALL_BACK' ? 1 : 0;
  }

  /**
   * Only ever writes the fields captured after a call ends (status, end
   * time, duration, notes, followup) — sakhiId/projectId/supervisorId/
   * callStartAt/callDatetime are immutable, matching this repo's
   * append-only-ledger convention.
   */
  async updateCallLog(id: string, data: UpdateCallLogInput, updatedByUserId: string) {
    const existing = await this.findCallLogById(id);
    if (!existing) return null;

    return this.prisma.callLog.update({
      where: { id },
      data: { ...data, updatedByUserId },
    });
  }

  findTrainingTopics() {
    return this.prisma.trainingTopic.findMany({
      where: { status: 'ACTIVE', isDeleted: false },
      orderBy: { topicName: 'asc' },
      take: 200,
    });
  }

  findTrainingTopicById(id: string) {
    return this.prisma.trainingTopic.findFirst({ where: { id, isDeleted: false } });
  }

  /** Every id must resolve to an ACTIVE topic — returns only the ids that do, for the caller to diff against what was requested. */
  async findActiveTrainingTopicIds(ids: string[]) {
    const rows = await this.prisma.trainingTopic.findMany({
      where: { id: { in: ids }, status: 'ACTIVE', isDeleted: false },
      select: { id: true },
    });
    return rows.map((r) => r.id);
  }

  createTrainingTopic(data: CreateTrainingTopicInput, createdByUserId: string) {
    return this.prisma.trainingTopic.create({
      data: { ...data, createdByUserId, updatedByUserId: createdByUserId },
    });
  }

  async rescheduleEvent(id: string, data: RescheduleEventInput, updatedByUserId: string) {
    const existing = await this.findEventById(id);
    if (!existing) return null;

    return this.prisma.supervisorEvent.update({
      where: { id },
      data: { eventDate: data.eventDate, remarks: data.remarks, updatedByUserId },
    });
  }

  /**
   * Creates the gallery row and, when the event has no completion photo yet,
   * also sets `photoMediaId` on the event in the same transaction — so the
   * gallery and the event's completion-eligibility flag can never disagree
   * from a partial write (see addEventPhoto's doc comment).
   */
  async createEventPhoto(
    eventId: string,
    mediaId: string,
    createdByUserId: string,
    setAsCompletionPhoto: boolean,
  ) {
    const [photo] = await this.prisma.$transaction([
      this.prisma.eventPhoto.create({ data: { eventId, mediaId, createdByUserId } }),
      ...(setAsCompletionPhoto
        ? [
            this.prisma.supervisorEvent.update({
              where: { id: eventId },
              data: { photoMediaId: mediaId, updatedByUserId: createdByUserId },
            }),
          ]
        : []),
    ]);
    return photo;
  }

  /**
   * Creates one gathering plus its gathering_topics rows atomically — a
   * gathering with zero topics would fail createGatheringSchema's own
   * `.min(1)`, so this only guards against a partial write leaving a
   * gathering row with no topics linked if the transaction fails midway.
   */
  createGathering(
    eventId: string,
    data: { gatheringDate: Date; topicIds: string[]; remarks?: string },
    createdByUserId: string,
  ) {
    return this.prisma.eventGathering.create({
      data: {
        eventId,
        gatheringDate: data.gatheringDate,
        remarks: data.remarks ?? null,
        createdByUserId,
        updatedByUserId: createdByUserId,
        topics: {
          create: data.topicIds.map((topicId) => ({ topicId, createdByUserId })),
        },
      },
      include: { topics: true },
    });
  }

  /**
   * Recent gatherings for offline reference, optionally scoped to one Sakhi.
   * `EventGathering` carries no `sakhiId` column (a gathering is a session,
   * not a per-Sakhi row), so `sakhiId` filters through the
   * `gathering_attendance` join relation instead — rows where that Sakhi has
   * an attendance record for the gathering. Ordered/limited to match
   * `findEvents`' "recent list" convention (date desc, capped at 50).
   */
  findGatherings(filters: ListGatheringsQuery = {}) {
    return this.prisma.eventGathering.findMany({
      where: {
        isDeleted: false,
        ...(filters.sakhiId
          ? { attendance: { some: { sakhiId: filters.sakhiId, isDeleted: false } } }
          : {}),
      },
      orderBy: { gatheringDate: 'desc' },
      take: 50,
    });
  }

  findGatheringById(id: string) {
    return this.prisma.eventGathering.findFirst({ where: { id, isDeleted: false } });
  }

  /** A gathering's topics, joined to the topic catalog for display (code/name), in creation order. */
  findGatheringTopics(gatheringId: string) {
    return this.prisma.gatheringTopic.findMany({
      where: { gatheringId },
      include: { topic: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  findGatheringAttendance(gatheringId: string) {
    return this.prisma.gatheringAttendance.findMany({
      where: { gatheringId, isDeleted: false },
    });
  }

  /**
   * A gathering's photos — `EventGathering` has no photo mechanism of its
   * own, so this returns the parent `SupervisorEvent`'s gallery
   * (`event_photos`), which is the only photo data actually captured for a
   * training day. Ordered oldest-first (upload order).
   */
  findEventPhotos(eventId: string) {
    return this.prisma.eventPhoto.findMany({
      where: { eventId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Upserts one row per Sakhi, keyed by the real DB unique constraint on
   * (gatheringId, sakhiId) — unlike event_attendance, gathering_attendance
   * has this constraint, so a genuine `prisma.upsert` works directly instead
   * of the find-then-branch pattern upsertAttendance needs.
   */
  async upsertGatheringAttendance(
    gatheringId: string,
    entries: UpdateGatheringAttendanceInput['attendance'],
    userId: string,
  ) {
    return this.prisma.$transaction(
      entries.map((entry) =>
        this.prisma.gatheringAttendance.upsert({
          where: { gatheringId_sakhiId: { gatheringId, sakhiId: entry.sakhiId } },
          create: {
            gatheringId,
            sakhiId: entry.sakhiId,
            attendanceStatus: entry.attendanceStatus,
            remarks: entry.remarks ?? null,
            createdByUserId: userId,
            updatedByUserId: userId,
          },
          update: {
            attendanceStatus: entry.attendanceStatus,
            remarks: entry.remarks ?? null,
            updatedByUserId: userId,
          },
        }),
      ),
    );
  }

  findTopicMark(gatheringId: string, topicId: string, sakhiId: string, markType: 'PRE' | 'POST') {
    return this.prisma.topicMark.findUnique({
      where: { gatheringId_topicId_sakhiId_markType: { gatheringId, topicId, sakhiId, markType } },
    });
  }

  /**
   * Every Pre/Post mark recorded for one gathering — all Sakhis, all topics
   * — joined to the topic catalog so the caller has topicCode/topicName
   * inline without a second lookup call. Unlike gathering_attendance,
   * topic_marks has no isDeleted column, so no soft-delete filter applies.
   */
  findTopicMarksByGathering(gatheringId: string) {
    return this.prisma.topicMark.findMany({
      where: { gatheringId },
      include: { topic: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Upserts by the real DB unique constraint on
   * (gatheringId, topicId, sakhiId, markType) — the service layer checks
   * `isLocked` before calling this, so an already-locked mark never reaches
   * here to be silently overwritten.
   */
  upsertTopicMark(
    gatheringId: string,
    topicId: string,
    sakhiId: string,
    markType: 'PRE' | 'POST',
    score: number,
    userId: string,
  ) {
    return this.prisma.topicMark.upsert({
      where: { gatheringId_topicId_sakhiId_markType: { gatheringId, topicId, sakhiId, markType } },
      create: {
        gatheringId,
        topicId,
        sakhiId,
        markType,
        score,
        createdByUserId: userId,
        updatedByUserId: userId,
      },
      update: { score, updatedByUserId: userId },
    });
  }

  lockTopicMark(id: string, updatedByUserId: string) {
    return this.prisma.topicMark.update({
      where: { id },
      data: { isLocked: true, lockedAt: new Date(), updatedByUserId },
    });
  }
}
