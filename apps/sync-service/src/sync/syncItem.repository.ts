import type { PrismaService } from '../prisma/prisma.service';
import type { CreateSyncItemInput } from './dto/create-syncItem.dto';

export interface CreatedSyncItem {
  id: string;
  localEntityUuid: string;
  entityType: string;
  status: 'QUEUED' | 'SUCCESS' | 'FAILED' | 'SKIPPED' | 'DUPLICATE' | 'PARTIAL';
  retryCount: number;
}

/**
 * Data access for sync items. Owns only this service's `sync_items` table.
 *
 * The dedupe/retry rules live here (not in the service layer) because they
 * both hinge on the same single lookup — "has this (localEntityUuid,
 * entityType) already SUCCEEDED, in any batch?" — and keeping the decision
 * next to the query it depends on avoids a second round-trip to re-derive
 * the same fact.
 */
export class SyncItemRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates one sync item, applying SRS §8.4's duplicate/retry rules:
   *
   * - If a `SUCCESS` item already exists for this `(localEntityUuid,
   *   entityType)` (in any batch — a Sakhi's app may resubmit the same
   *   entity across batches after an offline retry or app restart), this
   *   item is recorded as `DUPLICATE` instead of whatever status the
   *   caller reported, and `retryCount` is NOT incremented — a duplicate
   *   isn't a retry of something incomplete, it's confirmation something
   *   already-done was resubmitted.
   * - Otherwise, if a prior FAILED/SKIPPED item exists for the same key,
   *   this item's `retryCount` starts at that prior item's `retryCount + 1`
   *   — carrying the count forward across resubmissions instead of always
   *   starting at 0, so SRS §8.4's "track ... retry count" is a real
   *   running count, not reset every attempt.
   */
  async create(input: CreateSyncItemInput): Promise<CreatedSyncItem> {
    const priorSuccess = await this.prisma.syncItem.findFirst({
      where: {
        localEntityUuid: input.localEntityUuid,
        entityType: input.entityType,
        status: 'SUCCESS',
        isDeleted: false,
      },
      select: { id: true },
    });

    if (priorSuccess) {
      const created = await this.prisma.syncItem.create({
        data: { ...input, status: 'DUPLICATE' },
      });
      return {
        id: created.id,
        localEntityUuid: created.localEntityUuid,
        entityType: created.entityType,
        status: 'DUPLICATE',
        retryCount: created.retryCount,
      };
    }

    const priorAttempt = await this.prisma.syncItem.findFirst({
      where: {
        localEntityUuid: input.localEntityUuid,
        entityType: input.entityType,
        status: { in: ['FAILED', 'SKIPPED'] },
        isDeleted: false,
      },
      orderBy: { createdAt: 'desc' },
      select: { retryCount: true },
    });

    const created = await this.prisma.syncItem.create({
      data: { ...input, retryCount: priorAttempt ? priorAttempt.retryCount + 1 : 0 },
    });
    return {
      id: created.id,
      localEntityUuid: created.localEntityUuid,
      entityType: created.entityType,
      status: created.status as CreatedSyncItem['status'],
      retryCount: created.retryCount,
    };
  }

  /** Confirms the given syncBatchId belongs to userId — an ownership check for item creation. */
  async findBatchOwner(syncBatchId: string): Promise<string | null> {
    const batch = await this.prisma.syncBatch.findFirst({
      where: { id: syncBatchId, isDeleted: false },
      select: { userId: true },
    });
    return batch?.userId ?? null;
  }
}
