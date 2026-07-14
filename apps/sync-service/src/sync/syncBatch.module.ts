import type { Router } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { SyncBatchRepository } from './syncBatch.repository';
import { SyncBatchService } from './syncBatch.service';
import { createSyncBatchRouter } from './syncBatch.controller';

/**
 * Composition root for the sync-batch feature: wires repository → service → router.
 * Replaces the former NestJS module + DI container.
 */
export function createSyncBatchModule(prisma: PrismaService): Router {
  const repository = new SyncBatchRepository(prisma);
  const service = new SyncBatchService(repository);
  return createSyncBatchRouter(service);
}
