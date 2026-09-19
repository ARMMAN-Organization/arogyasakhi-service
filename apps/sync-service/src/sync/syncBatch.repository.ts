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
   * findLastSyncedAt. One aggregate query (not one per userId, and not a
   * full-table fetch reduced in application code): Prisma's `groupBy` with
   * `_max: { completedAt: true }` asks Postgres directly for exactly the one
   * value needed per user, instead of transferring every COMPLETED row for
   * the roster just to keep the first one seen. A userId with zero
   * COMPLETED batches simply has no entry in the returned Map — the caller
   * treats a missing entry the same as `findLastSyncedAt` returning null.
   */
  async findLastSyncedAtByUserIds(userIds: string[]): Promise<Map<string, Date>> {
    if (userIds.length === 0) return new Map();
    const rows = await this.prisma.syncBatch.groupBy({
      by: ['userId'],
      where: { userId: { in: userIds }, status: 'COMPLETED' },
      _max: { completedAt: true },
    });
    const byUserId = new Map<string, Date>();
    for (const row of rows) {
      if (!row._max.completedAt) continue;
      byUserId.set(row.userId, row._max.completedAt);
    }
    return byUserId;
  }

  /**
   * The most recent COMPLETED batch's completedAt per deviceId, for one
   * user — a finer-grained view than findLastSyncedAtByUserIds's per-user
   * aggregate (SRS §8.4: "stale devices that have not synced within the
   * configured threshold" — literally per-device, since a Sakhi with
   * multiple devices could have one stale and one active, which the
   * per-user aggregate alone can't distinguish). Additive: the existing
   * per-user roster dashboard is unaffected by this.
   */
  async findLastSyncedAtByDeviceIds(userId: string): Promise<Map<string, Date>> {
    const rows = await this.prisma.syncBatch.groupBy({
      by: ['deviceId'],
      where: { userId, status: 'COMPLETED' },
      _max: { completedAt: true },
    });
    const byDeviceId = new Map<string, Date>();
    for (const row of rows) {
      if (!row._max.completedAt) continue;
      byDeviceId.set(row.deviceId, row._max.completedAt);
    }
    return byDeviceId;
  }
}
