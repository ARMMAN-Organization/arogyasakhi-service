import { z } from 'zod';

/**
 * Query schema for `GET /sakhis/:sakhiId/call-logs/recent` (FR-SV-3.4). Kept
 * as a plain optional string with a `.refine()` (not `.coerce.number()`),
 * mirroring get-master-data-deltas.dto.ts — zod-to-openapi cannot introspect
 * `z.coerce.*`/`ZodEffects` internals and crashes OpenAPI doc generation at
 * startup.
 */
export const listRecentCallLogsQuerySchema = z
  .object({
    withinHours: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || (/^\d+$/.test(v) && Number(v) > 0), {
        message: 'withinHours: Must be a positive integer',
      }),
  })
  .strict();

export type ListRecentCallLogsQuery = z.infer<typeof listRecentCallLogsQuerySchema>;
