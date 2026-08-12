import { asyncHandler, ok, unauthorized } from '../app.module';
import type { NotificationService } from './notification.service';

/**
 * Notification request handlers. Mounted under the global `api/v1` prefix
 * by `notification.routes.ts`.
 */
export function createNotificationController(service: NotificationService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),

    create: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const created = await service.create(req.body, req.user, authorizationHeader);
      res.status(201).json(ok(created));
    }),
  };
}
