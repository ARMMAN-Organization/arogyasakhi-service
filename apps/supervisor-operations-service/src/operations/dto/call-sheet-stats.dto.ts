import { z } from 'zod';

/**
 * The 7 fixed "kind" rows a Sakhi's call-sheet stats card shows. Only
 * FOLLOWUP_PENDING is backed by real data today (CallLog.callStatus ===
 * 'CALL_BACK') — the other 6 need data models that either don't exist yet
 * or live in other services (visit schedules/instances, closure forms,
 * ANC/PNC risk state) and are returned as a fixed { count: 0, updated: 0 }
 * placeholder until that's scoped. See operations.service.ts's
 * getCallSheetStats for the per-kind breakdown.
 */
export const CALL_SHEET_STAT_KINDS = [
  'VISIT_DUE',
  'VISIT_3_DAYS_TO_EXPIRE',
  'FOLLOWUP_PENDING',
  'CLOSURE_FORM_PENDING',
  'MISSED_VISIT',
  'HIGH_RISK_ANC',
  'HIGH_RISK_PNC',
] as const;

export type CallSheetStatKind = (typeof CALL_SHEET_STAT_KINDS)[number];

/**
 * Batch is currently one sakhiClient.findById round-trip to auth-service per
 * id (parallelized, but still N calls) — capped so a card-grid list view
 * can't fan out an unbounded number of concurrent auth-service calls in one
 * request. Matches the visit-schedules bulk-upload endpoint's own cap.
 * Revisit if this ever needs a real roster (fetch-once-then-filter, like
 * beneficiary-service's listSakhiIdsForSupervisor) instead of per-id calls.
 */
export const MAX_BATCH_SAKHI_IDS = 100;

/**
 * Query schema for the batch variant, `GET /call-sheet-stats?sakhiIds=...`.
 * Kept as a plain string + `.refine()` (not `z.coerce.*`), matching
 * list-recent-call-logs.dto.ts's own note on why — zod-to-openapi cannot
 * introspect a `ZodEffects`-wrapped transform and crashes OpenAPI doc
 * generation at startup.
 */
export const listCallSheetStatsBatchQuerySchema = z
  .object({
    sakhiIds: z
      .string()
      .trim()
      .min(1)
      .refine(
        (v) => {
          const ids = v.split(',');
          return (
            ids.length <= MAX_BATCH_SAKHI_IDS &&
            ids.every((id) => z.string().uuid().safeParse(id.trim()).success)
          );
        },
        {
          message: `sakhiIds: must be a comma-separated list of at most ${MAX_BATCH_SAKHI_IDS} uuids`,
        },
      ),
  })
  .strict();

export type ListCallSheetStatsBatchQuery = z.infer<typeof listCallSheetStatsBatchQuerySchema>;
