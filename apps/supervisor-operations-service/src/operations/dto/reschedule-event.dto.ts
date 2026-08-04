import { z } from 'zod';

/**
 * Validation schema for rescheduling a SCHEDULED supervisor event to a new
 * date. `remarks` is optional — a reason isn't mandatory to move a date,
 * matching the event model's own optional `remarks` field. `.strict()`
 * rejects unknown fields, matching the repo-wide convention.
 */
export const rescheduleEventSchema = z
  .object({
    eventDate: z.coerce.date(),
    remarks: z.string().trim().min(1).optional(),
  })
  .strict();

export type RescheduleEventInput = z.infer<typeof rescheduleEventSchema>;
