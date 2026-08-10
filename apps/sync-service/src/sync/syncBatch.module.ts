import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { SyncBatchRepository } from './syncBatch.repository';
import { SyncBatchService } from './syncBatch.service';
import { registerSyncBatchRoutes } from './syncBatch.routes';

/**
 * Composition root for the sync-batch feature: wires repository → service → routes.
 * Replaces the former NestJS module + DI container.
 */
export function createSyncBatchModule(prisma: PrismaService): DocumentedRouter {
  const repository = new SyncBatchRepository(prisma);
  const service = new SyncBatchService(repository);
  const doc = createDocumentedRouter();
  registerSyncBatchRoutes(doc, service);
  return doc;
}
