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
}
