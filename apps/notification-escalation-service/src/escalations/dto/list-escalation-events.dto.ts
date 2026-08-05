import { z } from 'zod';

/**
 * Validation schema for GET /escalation-events query params. `cursor` is
 * opaque to the client — base64 of `${createdAt.toISOString()}|${id}` from
 * the last row of the previous page — so ordering ties (same createdAt
 * millisecond) still produce a stable, gapless cursor.
 */
export const listEscalationEventsSchema = z
  .object({
    status: z
      .enum([
        'OPEN',
        'ACKNOWLEDGED',
        'TRANSFER_REQUESTED',
        'CLOSE_REQUESTED',
        'RESOLVED',
        'DISMISSED',
      ])
      .default('OPEN'),
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListEscalationEventsInput = z.infer<typeof listEscalationEventsSchema>;
