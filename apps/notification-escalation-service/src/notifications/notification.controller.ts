import { asyncHandler, ok, unauthorized } from '../app.module';
import type { NotificationService } from './notification.service';
import type { UpdateNotificationStatusInput } from './dto/update-notification-status.dto';

/**
 * Notification request handlers. Mounted under the global `api/v1` prefix
 * by `notification.routes.ts`.
 */
export function createNotificationController(service: NotificationService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.list(req.user)));
    }),

    create: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const created = await service.create(req.body, req.user, authorizationHeader);
      res.status(201).json(ok(created));
    }),

    updateStatus: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const { status } = req.body as UpdateNotificationStatusInput;
      const updated = await service.updateStatus(req.params.id, status, req.user);
      res.json(ok(updated));
    }),
  };
}
