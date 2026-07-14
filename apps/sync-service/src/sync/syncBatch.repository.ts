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
}
