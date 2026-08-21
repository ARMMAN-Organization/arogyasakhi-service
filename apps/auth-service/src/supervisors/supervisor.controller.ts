import { asyncHandler, ok, unauthorized } from '../app.module';
import type { SupervisorService } from './supervisor.service';

/**
 * Supervisor→Manager hierarchy link and TRANSFER Manager-notice request
 * handlers (FR-SV-4.3). Mounted under the global `api/v1` prefix by
 * `supervisor.routes.ts`.
 */
export function createSupervisorController(service: SupervisorService) {
  return {
    setManager: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const result = await service.setManager(
        req.params.userId,
        req.body.managerUserId,
        req.user.id,
      );
      res.json(ok(result));
    }),

    sendTransferNotice: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const result = await service.sendTransferNotice(req.body, req.user);
      res.json(ok(result));
    }),
  };
}
