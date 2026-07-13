import { Router } from 'express';
import type { NotificationService } from './notification.service';
import { createNotificationSchema } from './dto/create-notification.dto';
import { asyncHandler, ok, validateBody } from '../app.module';

/** Notification HTTP routes. Mounted under the global `api/v1` prefix. */
export function createNotificationRouter(service: NotificationService): Router {
  const router = Router();

  router.get(
    '/notifications',
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.post(
    '/notifications',
    validateBody(createNotificationSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
