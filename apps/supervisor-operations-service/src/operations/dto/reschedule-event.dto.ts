import { z } from 'zod';
import { diffInDays, startOfUTCDay } from '@armman/core';

/**
 * Validation schema for rescheduling a SCHEDULED supervisor event to a new
 * date. `remarks` is optional — a reason isn't mandatory to move a date,
 * matching the event model's own optional `remarks` field. `.strict()`
 * rejects unknown fields, matching the repo-wide convention.
 */
export const rescheduleEventSchema = z
  .object({
    // eventDate is @db.Date (calendar date, no time-of-day) — comparing its
    // coerced midnight value against the exact current instant would reject
    // today itself for all but the first millisecond after UTC midnight, so
    // "now" is normalized to midnight UTC before comparing whole calendar days.
    eventDate: z.coerce.date().refine((date) => diffInDays(startOfUTCDay(new Date()), date) >= 0, {
      message: 'eventDate must not be in the past.',
    }),
    remarks: z.string().trim().min(3).optional(),
  })
  .strict();

export type RescheduleEventInput = z.infer<typeof rescheduleEventSchema>;
