import { conflict, forbidden, notFound, unprocessable } from '@armman/service-commons';
import type { OperationsRepository } from './operations.repository';
import type { CreateSupervisorEventInput } from './dto/create-supervisorEvent.dto';
import type { CreateInventoryItemInput } from './dto/create-inventory-item.dto';
import type { CreateInventoryTransactionInput } from './dto/create-inventory-transaction.dto';
import type { UpdateInventoryTransactionInput } from './dto/update-inventory-transaction.dto';
import type { SakhiClient } from './sakhi.client';

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

/** Supervisor operations domain logic. Data access is delegated to the repository. */
export class OperationsService {
  constructor(
    private readonly repository: OperationsRepository,
    private readonly sakhiClient: SakhiClient,
  ) {}

  listEvents() {
    return this.repository.findEvents();
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
   * this service's table — forklift rule). A MANAGER oversees multiple
   * Supervisors' Sakhis, so is unrestricted here.
   */
  async listInventoryTransactionsBySakhi(
    sakhiId: string,
    caller: CallerIdentity,
    authorizationHeader: string,
  ) {
    if (!caller.roles.includes('MANAGER')) {
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
   * Sakhi (MANAGER is exempt, matching the read path). Then validates every
   * referenced item exists and is ACTIVE before writing anything (fails the
   * whole submission up front rather than partway through the atomic
   * create), then persists one row per item.
   *
   * `supervisorId` is never taken from the client-supplied body — it's
   * always the authenticated caller's own id, so a Supervisor can never
   * record a transaction under another Supervisor's name.
   */
  async createInventoryTransactions(
    dto: CreateInventoryTransactionInput,
    caller: CallerIdentity,
    authorizationHeader: string,
  ) {
    if (!caller.roles.includes('MANAGER')) {
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

  async updateInventoryTransaction(
    id: string,
    dto: UpdateInventoryTransactionInput,
    caller: CallerIdentity,
  ) {
    const existing = await this.repository.findInventoryTransactionById(id);
    if (!existing) throw notFound('Inventory transaction not found.');
    if (existing.supervisorId !== caller.id) {
      throw forbidden('You do not have access to this transaction.');
    }

    const updated = await this.repository.updateInventoryTransaction(id, dto, caller.id);
    if (!updated) throw notFound('Inventory transaction not found.');
    return updated;
  }

  async deleteInventoryTransaction(id: string, caller: CallerIdentity) {
    const existing = await this.repository.findInventoryTransactionById(id);
    if (!existing) throw notFound('Inventory transaction not found.');
    if (existing.supervisorId !== caller.id) {
      throw forbidden('You do not have access to this transaction.');
    }

    const deleted = await this.repository.softDeleteInventoryTransaction(id, caller.id);
    if (!deleted) throw notFound('Inventory transaction not found.');
  }

  listCallLogs() {
    return this.repository.findCallLogs();
  }
}
