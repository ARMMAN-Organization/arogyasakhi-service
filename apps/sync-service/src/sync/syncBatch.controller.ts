import { z } from 'zod';
import { asyncHandler, ok, unauthorized } from '../app.module';
import type { SyncBatchService } from './syncBatch.service';
import type { lastSyncedQuerySchema } from './dto/last-synced-query.dto';

/**
 * Sync batch request handlers. Mounted under the global `api/v1` prefix by
 * `syncBatch.routes.ts`.
 */
export function createSyncBatchController(service: SyncBatchService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),

    create: asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),

    getLastSyncedAt: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = req.query as unknown as z.infer<typeof lastSyncedQuerySchema>;
      const lastSyncedAt = await service.getLastSyncedAt(
        query.userId,
        req.user,
        authorizationHeader,
      );
      res.json(ok({ lastSyncedAt: lastSyncedAt ? lastSyncedAt.toISOString() : null }));
    }),
  };
}
