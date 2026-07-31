import type { PrismaService } from '../prisma/prisma.service';
import type { CreateSupervisorEventInput } from './dto/create-supervisorEvent.dto';
import type { ListSupervisorEventsQuery } from './dto/list-supervisor-events.dto';
import type { UpdateAttendanceInput } from './dto/update-attendance.dto';
import type { CreateInventoryItemInput } from './dto/create-inventory-item.dto';
import type { CreateInventoryTransactionInput } from './dto/create-inventory-transaction.dto';
import type { UpdateInventoryTransactionInput } from './dto/update-inventory-transaction.dto';
import type { CreateCallLogInput } from './dto/create-call-log.dto';
import type { UpdateCallLogInput } from './dto/update-call-log.dto';

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

  createEvent(data: CreateSupervisorEventInput) {
    return this.prisma.supervisorEvent.create({ data });
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

  findCallLogs() {
    return this.prisma.callLog.findMany({
      where: { isDeleted: false },
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
}
