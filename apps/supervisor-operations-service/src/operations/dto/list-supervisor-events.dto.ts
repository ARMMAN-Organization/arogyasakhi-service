import { z } from 'zod';

/**
 * Query schema for `GET /supervisor-events`. Plain optional strings (not
 * `z.enum().optional()` composed with `.coerce`) — zod-to-openapi cannot
 * introspect `ZodEffects`/`ZodPipeline` internals and crashes OpenAPI doc
 * generation at startup, matching the convention in
 * get-master-data-deltas.dto.ts and list-recent-call-logs.dto.ts.
 */
export const listSupervisorEventsQuerySchema = z
  .object({
    status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']).optional(),
    eventType: z.enum(['MEETING', 'TRAINING']).optional(),
  })
  .strict();

export type ListSupervisorEventsQuery = z.infer<typeof listSupervisorEventsQuerySchema>;
