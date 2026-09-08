import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { AnalyticsEventService } from './analyticsEvent.service';
import { createAnalyticsEventController } from './analyticsEvent.controller';
import {
  MAX_BATCH_EVENTS,
  createAnalyticsEventBatchSchema,
} from './dto/create-analytics-event.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

// Request DTO annotated with an example for Swagger UI; validation behavior
// is unchanged EXCEPT it must re-apply .min(1).max(MAX_BATCH_EVENTS) below —
// calling `.element` to reach into the array's item schema and then
// `.array()` again builds a brand-new, unconstrained array type; it does
// NOT preserve the original schema's min/max refinements, so they must be
// restated here or this "documented" schema silently diverges from what
// createAnalyticsEventBatchSchema actually enforces (caught via live
// testing: an empty `events: []` was wrongly accepted before this was
// added). payloadJson is built on z.lazy() (see create-analytics-event.dto.ts)
// — zod-to-openapi cannot introspect z.lazy() on its own, so `type: 'object'`
// is required here to short-circuit its type inference (same fix as
// audit-service's own auditLog.routes.ts for beforeJson/afterJson).
const createAnalyticsEventBatchRequestSchema = z.object({
  events: createAnalyticsEventBatchSchema.shape.events.element
    .extend({
      payloadJson: createAnalyticsEventBatchSchema.shape.events.element.shape.payloadJson.openapi({
        type: 'object',
        example: {},
      }),
    })
    .array()
    .min(1)
    .max(MAX_BATCH_EVENTS)
    .openapi({
      example: [
        {
          featureArea: 'ENROLLMENT',
          eventName: 'FORM_SUBMIT',
          occurredAt: '2026-09-08T10:15:00.000Z',
          payloadJson: { durationMs: 42000 },
          localEventUuid: 'a1b2c3d4-...-enrollment-submit-1',
        },
      ],
    }),
});

const batchResultSchema = z.object({
  created: z.number().int().nonnegative(),
  failed: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      localEventUuid: z.string().optional(),
      message: z.string(),
    }),
  ),
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
 * Analytics-event HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself, same convention as
 * audit-service's own auditLog.routes.ts.
 */
export function registerAnalyticsEventRoutes(
  doc: DocumentedRouter,
  service: AnalyticsEventService,
) {
  const controller = createAnalyticsEventController(service);

  doc.post(
    '/analytics/events/batch',
    {
      summary:
        'Ingest a batch of client-emitted Sakhi-app analytics events (SRS Section 9). ' +
        'Events are queued locally on-device and synced with each regular data upload, ' +
        'not as a separate live call per event.',
      tags: ['Analytics'],
      responses: {
        201: {
          description:
            'Batch processed — partial success by design: `created` counts events ' +
            'persisted (including idempotent replays), `failed` lists per-event errors ' +
            '(e.g. a UUID collision) without failing the whole batch.',
          schema: envelope(batchResultSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    // SAKHI-only: this endpoint captures Sakhi mobile-app usage per SRS
    // Section 9's own scope ("Applies to: Sakhi Mobile App. Supervisor app
    // metrics not defined in PRD.") — no Supervisor/Manager caller has
    // events to report here.
    requireRoles('SAKHI'),
    validateBody(createAnalyticsEventBatchRequestSchema),
    controller.createBatch,
  );
}
