import type { PrismaService } from '../prisma/prisma.service';
import type { CreateSyncBatchInput } from './dto/create-syncBatch.dto';

/** Data access for sync batches. Owns only this service's `sync_batches` table. */
export class SyncBatchRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.syncBatch.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateSyncBatchInput) {
    return this.prisma.syncBatch.create({ data });
  }

  /**
   * The most recent COMPLETED batch's completedAt for a user — "last
   * synced" for the Sakhi dashboard. Ignores STARTED/FAILED/PARTIAL/
   * CANCELLED batches even if more recent — an incomplete/failed sync isn't
   * "synced". Returns null if the user has never completed a sync.
   */
  async findLastSyncedAt(userId: string): Promise<Date | null> {
    const batch = await this.prisma.syncBatch.findFirst({
      where: { userId, status: 'COMPLETED' },
      orderBy: { completedAt: 'desc' },
      select: { completedAt: true },
    });
    return batch?.completedAt ?? null;
  }

  /**
   * The most recent COMPLETED batch's completedAt per userId, for the
   * Supervisor roster dashboard — the batch counterpart of
   * findLastSyncedAt. A single query (not one per userId): every COMPLETED
   * batch for the roster, grouped in application code to the max
   * completedAt per user, since Prisma's `groupBy` can't express "max of a
   * field, but return that whole row" directly. A userId with zero
   * COMPLETED batches simply has no entry in the returned Map — the caller
   * treats a missing entry the same as `findLastSyncedAt` returning null.
   */
  async findLastSyncedAtByUserIds(userIds: string[]): Promise<Map<string, Date>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.syncBatch.findMany({
      where: { userId: { in: userIds }, status: 'COMPLETED' },
      select: { userId: true, completedAt: true },
      orderBy: { completedAt: 'desc' },
    });
    const byUserId = new Map<string, Date>();
    for (const row of rows) {
      if (!row.completedAt) continue;
      if (!byUserId.has(row.userId)) byUserId.set(row.userId, row.completedAt);
    }
    return byUserId;
  }
}
