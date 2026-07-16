import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { NotificationService } from './notification.service';
import { createNotificationSchema } from './dto/create-notification.dto';
import { asyncHandler, createDocumentedRouter, ok, validateBody } from '../app.module';

extendZodWithOpenApi(z);

const notificationSchema = z.object({
  id: z.string().uuid(),
  recipientUserId: z.string().openapi({ example: 'jane.sakhi' }),
  notificationType: z.string().openapi({ example: 'MISSED_VISIT_ESCALATION' }),
  title: z.string().openapi({ example: 'Visit overdue' }),
  body: z.string().nullable(),
  priority: z.number().int().openapi({ example: 5 }),
  ctaType: z.string().nullable(),
  linkedEntityType: z.string().nullable(),
  linkedEntityId: z.string().nullable(),
  status: z.string().openapi({ example: 'UNREAD' }),
  readAt: z.string().datetime().nullable(),
  dismissedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  details: z.record(z.unknown()).optional(),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Notification HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body schema
 * is inferred from `validateBody` already in the middleware chain, so
 * `/docs.json` can never drift from what's actually mounted.
 */
export function createNotificationRouter(service: NotificationService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/notifications',
    {
      summary: 'List recent notifications',
      tags: ['Notifications'],
      responses: {
        200: { description: 'Notifications', schema: envelope(z.array(notificationSchema)) },
      },
    },
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  doc.post(
    '/notifications',
    {
      summary: 'Create a notification',
      tags: ['Notifications'],
      responses: {
        201: { description: 'Notification created', schema: envelope(notificationSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
      },
    },
    validateBody(createNotificationSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
