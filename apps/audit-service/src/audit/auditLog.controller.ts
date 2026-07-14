import { Router } from 'express';
import type { AuditLogService } from './auditLog.service';
import { createAuditLogSchema } from './dto/create-auditLog.dto';
import { asyncHandler, ok, validateBody } from '../app.module';

/** Audit log HTTP routes. Mounted under the global `api/v1` prefix. */
export function createAuditLogRouter(service: AuditLogService): Router {
  const router = Router();

  router.get(
    '/audit',
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.post(
    '/audit',
    validateBody(createAuditLogSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
