import { asyncHandler, ok, unauthorized } from '../app.module';
import type { SyncPendingService } from './syncPending.service';
import type { SyncPendingQuery } from './dto/sync-pending-query.dto';

/**
 * Sync-pending request handlers. Mounted under the global `api/v1` prefix by
 * `syncPending.routes.ts`.
 */
export function createSyncPendingController(service: SyncPendingService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      // trustGatewayIdentity always runs first on this route and calls
      // next(unauthorized()) on its own failure, so req.user is populated by
      // the time this handler runs; the check here is belt-and-braces so a
      // future route wiring change can't silently drop it.
      if (!req.user) return next(unauthorized());
      const { userId } = req.query as unknown as SyncPendingQuery;
      res.json(ok(await service.listPending(userId, req.user.id)));
    }),
  };
}
