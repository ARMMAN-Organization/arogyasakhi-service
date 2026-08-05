import type { PrismaService } from '../prisma/prisma.service';

/** Data access for the approval_requests half of Quick Response's merged feed. */
export class QuickResponseRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cursor-paginated by `(createdAt, id)` DESC, same scheme as
   * notification-escalation-service's escalation.repository.ts — `id`
   * breaks ties within the same millisecond.
   */
  findMany(
    decisionStatusLookupId: string,
    limit: number,
    cursor: { createdAt: Date; id: string } | null,
  ) {
    return this.prisma.approvalRequest.findMany({
      where: {
        decisionStatusLookupId,
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
      take: limit + 1,
    });
  }

  findById(id: string) {
    return this.prisma.approvalRequest.findFirst({ where: { id, isDeleted: false } });
  }
}
