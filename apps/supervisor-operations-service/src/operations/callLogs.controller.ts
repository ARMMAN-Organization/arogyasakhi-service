import { asyncHandler, ok, unauthorized } from '../app.module';
import type { OperationsService } from './operations.service';

/**
 * Call-log request handlers. Mounted under the global `api/v1` prefix by
 * `callLogs.routes.ts`.
 */
export function createCallLogsController(service: OperationsService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.listCallLogs(req.user)));
    }),

    create: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const created = await service.createCallLog(req.body, req.user, authorizationHeader);
      res.status(201).json(ok(created));
    }),

    getById: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getCallLog(req.params.callLogId, req.user)));
    }),

    update: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const updated = await service.updateCallLog(req.params.callLogId, req.body, req.user);
      res.json(ok(updated));
    }),

    listBySakhi: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(
        ok(await service.listCallLogsBySakhi(req.params.sakhiId, req.user, authorizationHeader)),
      );
    }),

    listRecentBySakhi: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const withinHours = req.query.withinHours ? Number(req.query.withinHours) : undefined;
      res.json(
        ok(
          await service.listRecentCallLogsBySakhi(
            req.params.sakhiId,
            req.user,
            authorizationHeader,
            withinHours,
          ),
        ),
      );
    }),

    getCallSheetStatsBySakhi: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(
        ok(await service.getCallSheetStats(req.params.sakhiId, req.user, authorizationHeader)),
      );
    }),

    getCallSheetStatsBatch: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const sakhiIds = String(req.query.sakhiIds)
        .split(',')
        .map((id) => id.trim());
      res.json(ok(await service.getCallSheetStatsBatch(sakhiIds, req.user, authorizationHeader)));
    }),
  };
}
