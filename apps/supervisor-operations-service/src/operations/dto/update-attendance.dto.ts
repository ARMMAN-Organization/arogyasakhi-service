import { z } from 'zod';

/**
 * Validation schema for `PUT /supervisor-events/:id/attendance` (FR-SV-2.3,
 * ERD §4.7 event_attendance). One entry per Sakhi marked present/absent for
 * the event; pre/post training scores only meaningful for TRAINING events
 * but accepted unconditionally here (the column allows it for either event
 * type — see EventAttendance model comment). `.strict()` rejects unknown
 * fields, matching the repo-wide convention.
 */
const attendanceEntrySchema = z
  .object({
    sakhiId: z.string().uuid(),
    attendanceStatus: z.enum(['PRESENT', 'ABSENT', 'PARTIAL']),
    preTrainingScore: z.number().min(0).max(100).optional(),
    postTrainingScore: z.number().min(0).max(100).optional(),
    remarks: z.string().trim().min(1).optional(),
  })
  .strict();

export const updateAttendanceSchema = z
  .object({
    attendance: z.array(attendanceEntrySchema).min(1),
  })
  .strict()
  .refine(
    (data) => {
      const ids = data.attendance.map((entry) => entry.sakhiId);
      return new Set(ids).size === ids.length;
    },
    {
      // There is no DB unique constraint on (eventId, sakhiId) — see
      // operations.repository.ts's upsertAttendance comment — so a duplicate
      // sakhiId here would silently create two rows for the same Sakhi
      // instead of one, since upsertAttendance's existing-row lookup runs
      // once before the loop and can't see a sibling entry's insert.
      message: 'attendance: sakhiId must not repeat within one submission.',
      path: ['attendance'],
    },
  );

export type UpdateAttendanceInput = z.infer<typeof updateAttendanceSchema>;
