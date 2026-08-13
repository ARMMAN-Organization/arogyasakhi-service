import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { NotificationService } from './notification.service';
import { createNotificationController } from './notification.controller';
import { createNotificationSchema } from './dto/create-notification.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

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
export function registerNotificationRoutes(doc: DocumentedRouter, service: NotificationService) {
  const controller = createNotificationController(service);

  doc.get(
    '/notifications',
    {
      summary: 'List recent notifications',
      tags: ['Notifications'],
      responses: {
        200: { description: 'Notifications', schema: envelope(z.array(notificationSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    controller.list,
  );

  doc.post(
    '/notifications',
    {
      summary: 'Create a notification',
      tags: ['Notifications'],
      responses: {
        201: { description: 'Notification created', schema: envelope(notificationSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    // ADMIN direct use, plus SUPERVISOR so approval-service can notify a
    // Sakhi on the caller's behalf after a Quick Response decision (it
    // forwards the deciding Supervisor's own Authorization header, same
    // pattern supervisor-operations-service's SakhiClient uses — no
    // separate service-to-service credential scheme in this codebase yet).
    requireRoles('ADMIN', 'SUPERVISOR'),
    validateBody(createNotificationSchema),
    controller.create,
  );
}
