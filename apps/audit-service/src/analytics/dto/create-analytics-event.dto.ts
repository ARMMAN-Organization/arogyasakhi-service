import { z } from 'zod';

/** Recursive JSON value type usable inside nested objects/arrays (nulls allowed here). */
type NestedJsonValue =
  string | number | boolean | null | NestedJsonValue[] | { [key: string]: NestedJsonValue };

const nestedJsonValueSchema: z.ZodType<NestedJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(nestedJsonValueSchema),
    z.record(nestedJsonValueSchema),
  ]),
);

/**
 * Top-level JSON value schema matching Prisma's `InputJsonValue`, which —
 * unlike nested positions — does not accept a bare `null` (the field is
 * simply omitted when absent). Same shape as audit-service's own
 * create-auditLog.dto.ts's jsonValueSchema.
 */
const jsonValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(nestedJsonValueSchema),
  z.record(nestedJsonValueSchema),
]);

/**
 * Caps how many events one batch upload can carry, so a caller can't pass an
 * unbounded array in one request. Events are queued locally between syncs
 * (SRS Sec 9.9), so a single upload can legitimately carry many events
 * accumulated across a day's app usage — kept generous relative to the
 * card-batch caps elsewhere in this codebase, which bound a page of UI
 * cards, not an accumulated event queue.
 */
export const MAX_BATCH_EVENTS = 200;

/** One client-emitted analytics event (SRS Section 9). */
export const analyticsEventSchema = z
  .object({
    featureArea: z.string().trim().min(1).max(60),
    eventName: z.string().trim().min(1).max(120),
    occurredAt: z.string().datetime(),
    payloadJson: jsonValueSchema.optional(),
    // Idempotency key for this offline-first, batch-synced caller — a
    // dropped-connection retry of a batch resubmits the same client-generated
    // value per event. Optional in the schema (matching audit_log's own
    // localAuditUuid) but the Sakhi app should always supply one in practice.
    localEventUuid: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export type AnalyticsEventInput = z.infer<typeof analyticsEventSchema>;

/**
 * Body for `POST /analytics/events/batch`. `.strict()` rejects unknown
 * fields, matching every other DTO in this codebase.
 */
export const createAnalyticsEventBatchSchema = z
  .object({
    events: z.array(analyticsEventSchema).min(1).max(MAX_BATCH_EVENTS),
  })
  .strict();

export type CreateAnalyticsEventBatchInput = z.infer<typeof createAnalyticsEventBatchSchema>;
