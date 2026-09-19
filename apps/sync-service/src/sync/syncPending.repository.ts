import type { PrismaService } from '../prisma/prisma.service';

/**
 * A single outstanding sync item, with its parent batch's `deviceId` and
 * `startedAt` inlined so the "Sakhi Not Uploaded Data" screen never needs a
 * second call per row (see `syncBatch.routes.ts`'s `GET /sync` for the same
 * field naming on the batch itself).
 */
export interface PendingSyncItem {
  id: string;
  syncBatchId: string;
  localEntityUuid: string;
  entityType: string;
  entityId: string | null;
  operation: 'CREATE' | 'UPDATE' | 'DELETE' | 'UPSERT';
  status: 'QUEUED' | 'FAILED' | 'SKIPPED';
  errorCode: string | null;
  retryCount: number;
  createdAt: Date;
  deviceId: string;
  startedAt: Date;
}

/**
 * Data access for outstanding (not yet `SUCCESS`) sync items. Owns only this
 * service's `sync_items`/`sync_batches` tables — the join stays local to this
 * service, no cross-service reach into e.g. auth-service's `sakhi_profiles`.
 */
export class SyncPendingRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds non-deleted sync items still genuinely outstanding — `QUEUED`,
   * `FAILED`, or `SKIPPED` — for the sync batches owned by `userId`, newest
   * first. Explicit inclusion, not `status: { not: 'SUCCESS' }`: `DUPLICATE`
   * and `PARTIAL` are also not `SUCCESS`, but neither is "pending" — a
   * DUPLICATE item is a resubmission of something already synced (nothing
   * to retry), and PARTIAL is its own terminal outcome, not a queued state.
   */
  async findPending(userId: string): Promise<PendingSyncItem[]> {
    const rows = await this.prisma.syncItem.findMany({
      where: {
        isDeleted: false,
        status: { in: ['QUEUED', 'FAILED', 'SKIPPED'] },
        syncBatch: { userId },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        syncBatch: { select: { deviceId: true, startedAt: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      syncBatchId: row.syncBatchId,
      localEntityUuid: row.localEntityUuid,
      entityType: row.entityType,
      entityId: row.entityId,
      operation: row.operation,
      // Safe: the `status: { in: [...] }` filter above guarantees this
      // narrowing at runtime; Prisma's generated type just isn't narrowed by it.
      status: row.status as PendingSyncItem['status'],
      errorCode: row.errorCode,
      retryCount: row.retryCount,
      createdAt: row.createdAt,
      deviceId: row.syncBatch.deviceId,
      startedAt: row.syncBatch.startedAt,
    }));
  }
}
