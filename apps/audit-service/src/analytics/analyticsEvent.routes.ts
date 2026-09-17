import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { AnalyticsEventService } from './analyticsEvent.service';
import { createAnalyticsEventController } from './analyticsEvent.controller';
import {
  MAX_BATCH_EVENTS,
  createAnalyticsEventBatchSchema,
} from './dto/create-analytics-event.dto';
import {
  listAnalyticsEventsQueryObjectSchema,
  listAnalyticsEventsQuerySchema,
} from './dto/list-analytics-events-query.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validate,
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

  doc.get(
    '/analytics/events',
    {
      summary:
        'SYSTEM-only: raw analytics events for one feature area within a time window — the ' +
        "candidate set for reporting-etl-service's metric-aggregation job (SRS Sec 9.9's ETL " +
        'step). Cursor-paginated via cursor/limit (default 200, max 500). Unscoped — unlike ' +
        'the batch-ingest endpoint above, there is no Sakhi filter: the only caller is a ' +
        'background job aggregating across all Sakhis for the period.',
      tags: ['Analytics'],
      responses: {
        200: {
          description: 'Analytics events for the requested feature area and window',
          schema: envelope(
            z.object({
              items: z.array(
                z.object({
                  id: z.string().uuid(),
                  sakhiUserId: z.string().nullable(),
                  eventName: z.string(),
                  occurredAt: z.string().datetime(),
                  payloadJson: z.unknown().nullable(),
                }),
              ),
              nextCursor: z.string().nullable(),
            }),
          ),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
      // Explicit override: the real runtime schema (below) is a ZodEffects
      // (wrapped in `.refine()`), which zod-to-openapi's query-param walker
      // cannot introspect the same way as a plain object — same pattern as
      // visit-form-service's visitHistoryQuerySchema doc override in
      // visitInstance.routes.ts. Documents the same fields; validate() still
      // enforces the full refined schema at runtime, unaffected by this.
      query: listAnalyticsEventsQueryObjectSchema,
    },
    trustGatewayIdentity,
    requireRoles('SYSTEM'),
    validate(listAnalyticsEventsQuerySchema, 'query'),
    controller.list,
  );
}
