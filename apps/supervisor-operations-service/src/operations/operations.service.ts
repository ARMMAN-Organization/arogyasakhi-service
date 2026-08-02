import { conflict, forbidden, notFound, unprocessable } from '@armman/service-commons';
import type { OperationsRepository } from './operations.repository';
import type { CreateSupervisorEventInput } from './dto/create-supervisorEvent.dto';
import type { ListSupervisorEventsQuery } from './dto/list-supervisor-events.dto';
import type { UpdateAttendanceInput } from './dto/update-attendance.dto';
import type { CreateInventoryItemInput } from './dto/create-inventory-item.dto';
import type { CreateInventoryTransactionInput } from './dto/create-inventory-transaction.dto';
import type { UpdateInventoryTransactionInput } from './dto/update-inventory-transaction.dto';
import type { CreateCallLogInput } from './dto/create-call-log.dto';
import type { UpdateCallLogInput } from './dto/update-call-log.dto';
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

/** Supervisor operations domain logic. Data access is delegated to the repository. */
export class OperationsService {
  constructor(
    private readonly repository: OperationsRepository,
    private readonly sakhiClient: SakhiClient,
  ) {}

  listEvents(filters?: ListSupervisorEventsQuery) {
    return this.repository.findEvents(filters);
  }

  createEvent(dto: CreateSupervisorEventInput) {
    // The DTO's photoMediaId is application-mandatory when status = COMPLETED
    // (ERD §4.7) — the schema keeps it optional so SCHEDULED/CANCELLED events
    // can be created without a photo, so this rule is enforced here instead.
    if (dto.status === 'COMPLETED' && !dto.photoMediaId) {
      throw unprocessable('photoMediaId is required when status is COMPLETED.');
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

  listCallLogs() {
    return this.repository.findCallLogs();
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
}
