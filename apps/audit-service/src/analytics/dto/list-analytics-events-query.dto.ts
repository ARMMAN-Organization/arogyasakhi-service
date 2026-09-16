import { z } from 'zod';

/**
 * Query params for `GET /analytics/events` — a SYSTEM-only, server-to-server
 * endpoint for reporting-etl-service's metric-aggregation job (SRS Sec 9.9's
 * ETL step). No sakhiId/caller scoping (unlike the batch-ingest endpoint):
 * the only caller is a background job aggregating across all Sakhis for a
 * given feature area and time window, not a Sakhi viewing her own data.
 */
export const listAnalyticsEventsQuerySchema = z
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
  .strict()
  .refine((data) => new Date(data.since) < new Date(data.until), {
    message: 'since: Must be before until.',
  });

export type ListAnalyticsEventsQueryInput = z.infer<typeof listAnalyticsEventsQuerySchema>;
