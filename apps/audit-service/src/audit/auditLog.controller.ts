import { asyncHandler, ok, unauthorized } from '../app.module';
import type { AuditLogService } from './auditLog.service';

/**
 * Audit log request handlers. Mounted under the global `api/v1` prefix by
 * `auditLog.routes.ts`.
 */
export function createAuditLogController(service: AuditLogService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),

    create: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.create(req.body, req.user);
      res.status(201).json(ok(created));
    }),
  };
}
