import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { SyncBatchRepository } from './syncBatch.repository';
import { SyncBatchService } from './syncBatch.service';
import { registerSyncBatchRoutes } from './syncBatch.routes';
import { SyncPendingRepository } from './syncPending.repository';
import { SyncPendingService } from './syncPending.service';
import { registerSyncPendingRoutes } from './syncPending.routes';

/**
 * Composition root for the sync feature: wires repository → service → routes
 * for both sub-domains it owns (sync batches, and outstanding sync items).
 * Replaces the former NestJS module + DI container.
 *
 * Both `registerSyncBatchRoutes` and `registerSyncPendingRoutes` register
 * into the same `doc` (one `createDocumentedRouter()` call) — a
 * `DocumentedRouter` produces exactly one OpenAPI registry per call, so
 * building a second one for sync-pending would silently produce two
 * incomplete Swagger docs instead of one complete one (see
 * `operations.module.ts` in supervisor-operations-service for the same
 * shared-registry pattern across multiple sub-domains).
 */
export function createSyncBatchModule(prisma: PrismaService): DocumentedRouter {
  const batchRepository = new SyncBatchRepository(prisma);
  const batchService = new SyncBatchService(batchRepository);
  const pendingRepository = new SyncPendingRepository(prisma);
  const pendingService = new SyncPendingService(pendingRepository);

  const doc = createDocumentedRouter();
  registerSyncBatchRoutes(doc, batchService);
  registerSyncPendingRoutes(doc, pendingService);
  return doc;
}
