import { z } from 'zod';

/**
 * Query params for `GET /analytics/events` — a SYSTEM-only, server-to-server
 * endpoint for reporting-etl-service's metric-aggregation job (SRS Sec 9.9's
 * ETL step). No sakhiId/caller scoping (unlike the batch-ingest endpoint):
 * the only caller is a background job aggregating across all Sakhis for a
 * given feature area and time window, not a Sakhi viewing her own data.
 */
// Plain (unrefined) object form, exported separately so the OpenAPI doc
// route can pass it as an explicit `query:` override (same pattern as
// visit-form-service's visitHistoryQuerySchema usage in
// visitInstance.routes.ts) — zod-to-openapi's query-param walker needs a
// plain AnyZodObject to derive each param's name from its shape; the
// `.refine()` below wraps it in a ZodEffects, which the walker cannot
// introspect the same way (surfaced as a startup MissingParameterDataError
// when this schema was only registered via `validate(schema, 'query')`
// inference). Runtime validation is unaffected — `validate()` still
// enforces the full schema with `.refine()` applied, below.
export const listAnalyticsEventsQueryObjectSchema = z
  .object({
    featureArea: z.string().trim().min(1).max(60),
    // Half-open window [since, until) — the job's own periodStart/periodEnd
    // for the aggregation run it's currently computing.
    since: z.string().datetime(),
    until: z.string().datetime(),
    // Opaque, base64-encoded cursor — see analyticsEvent.repository.ts's
    // encode/decodeCursor.
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();

export const listAnalyticsEventsQuerySchema = listAnalyticsEventsQueryObjectSchema.refine(
  (data) => new Date(data.since) < new Date(data.until),
  { message: 'since: Must be before until.' },
);

export type ListAnalyticsEventsQueryInput = z.infer<typeof listAnalyticsEventsQuerySchema>;
