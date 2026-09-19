import { z } from 'zod';

/**
 * Query params for `POST /visits/cleanup-duplicate-schedules` (see
 * visitInstance.routes.ts). Kept as a raw 'true'/'false' enum (no
 * `.transform()`) so the OpenAPI doc router can annotate it directly —
 * see visitInstance.controller.ts's cleanupDuplicateSchedules handler for
 * the string-to-boolean conversion, where omitted is treated as "true" so
 * a bare POST with no query string never mutates data; the caller must
 * explicitly pass `?dryRun=false` to soft-delete.
 */
export const cleanupDuplicateSchedulesQuerySchema = z
  .object({
    dryRun: z.enum(['true', 'false']).optional(),
  })
  .strict();

export type CleanupDuplicateSchedulesQuery = z.infer<typeof cleanupDuplicateSchedulesQuerySchema>;
