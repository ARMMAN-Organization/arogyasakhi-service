import { asyncHandler, ok, unauthorized } from '../app.module';
import type { StaleSakhisService } from './staleSakhis.service';
import type { StaleSakhisQueryInput } from './dto/stale-sakhis-query.dto';

/**
 * Stale-Sakhis request handlers. Mounted under the global `api/v1` prefix by
 * `staleSakhis.routes.ts`.
 */
export function createStaleSakhisController(service: StaleSakhisService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { days } = req.query as unknown as StaleSakhisQueryInput;
      const rows = await service.listStale(days, req.user, authorizationHeader);
      res.json(
        ok(
          rows.map((row) => ({
            userId: row.userId,
            lastSyncAt: row.lastSyncAt.toISOString(),
            daysSinceSync: row.daysSinceSync,
            pendingCount: row.pendingCount,
            failedCount: row.failedCount,
          })),
        ),
      );
    }),
  };
}
