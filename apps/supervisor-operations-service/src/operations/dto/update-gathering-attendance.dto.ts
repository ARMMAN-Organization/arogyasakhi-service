import { z } from 'zod';

/**
 * Validation schema for `PUT /gatherings/:gatheringId/attendance`. One entry
 * per Sakhi marked present/absent for the session. Unlike event_attendance,
 * gathering_attendance has a real DB unique constraint on
 * (gatheringId, sakhiId), but a duplicate sakhiId within one submission is
 * still rejected here — matching update-attendance.dto.ts's convention —
 * so an ambiguous double-entry surfaces as a clear 400 rather than the last
 * write silently winning. `.strict()` rejects unknown fields, matching the
 * repo-wide convention.
 */
const gatheringAttendanceEntrySchema = z
  .object({
    sakhiId: z.string().uuid(),
    attendanceStatus: z.enum(['PRESENT', 'ABSENT', 'PARTIAL']),
    remarks: z.string().trim().min(1).optional(),
  })
  .strict();

export const updateGatheringAttendanceSchema = z
  .object({
    attendance: z.array(gatheringAttendanceEntrySchema).min(1),
  })
  .strict()
  .refine(
    (data) => {
      const ids = data.attendance.map((entry) => entry.sakhiId);
      return new Set(ids).size === ids.length;
    },
    {
      message: 'attendance: sakhiId must not repeat within one submission.',
      path: ['attendance'],
    },
  );

export type UpdateGatheringAttendanceInput = z.infer<typeof updateGatheringAttendanceSchema>;
