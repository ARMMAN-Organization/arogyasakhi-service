import type { PrismaService } from '../prisma/prisma.service';
import type { ListEscalationEventsInput } from './dto/list-escalation-events.dto';

/** Data access for escalation events. Owns only this service's `escalation_event` table. */
export class EscalationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cursor-paginated by `(createdAt, id)` DESC — `id` breaks ties within the
   * same millisecond so the cursor stays gapless. Fetches `limit + 1` rows to
   * know whether a next page exists without a separate count query.
   */
  async findMany(query: ListEscalationEventsInput, cursor: { createdAt: Date; id: string } | null) {
    const rows = await this.prisma.escalationEvent.findMany({
      where: {
        status: query.status,
        isDeleted: false,
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    return rows;
  }

  findById(id: string) {
    return this.prisma.escalationEvent.findFirst({ where: { id, isDeleted: false } });
  }
}
