import type { PrismaService } from '../prisma/prisma.service';
import type { CreateSupervisorEventInput } from './dto/create-supervisorEvent.dto';
import type { CreateInventoryItemInput } from './dto/create-inventory-item.dto';
import type { CreateInventoryTransactionInput } from './dto/create-inventory-transaction.dto';
import type { UpdateInventoryTransactionInput } from './dto/update-inventory-transaction.dto';

/**
 * Data access for supervisor operations. Owns only this service's tables
 * (supervisor_events, event_attendance, inventory_items, inventory_transactions,
 * call_logs) — no cross-service joins (forklift rule).
 */
export class OperationsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findEvents() {
    return this.prisma.supervisorEvent.findMany({
      where: { isDeleted: false },
      orderBy: { eventDate: 'desc' },
      take: 50,
    });
  }

  createEvent(data: CreateSupervisorEventInput) {
    return this.prisma.supervisorEvent.create({ data });
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
}
