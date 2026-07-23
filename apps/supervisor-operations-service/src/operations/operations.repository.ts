import type { PrismaService } from '../prisma/prisma.service';
import type { CreateSupervisorEventInput } from './dto/create-supervisorEvent.dto';

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

  findInventoryTransactions() {
    return this.prisma.inventoryTransaction.findMany({
      where: { isDeleted: false },
      orderBy: { transactionDate: 'desc' },
      take: 50,
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
