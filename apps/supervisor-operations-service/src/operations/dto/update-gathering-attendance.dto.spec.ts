import { updateGatheringAttendanceSchema } from './update-gathering-attendance.dto';

describe('updateGatheringAttendanceSchema — duplicate sakhiId', () => {
  const entry = (sakhiId: string) => ({
    sakhiId,
    attendanceStatus: 'PRESENT' as const,
  });

  it('accepts distinct sakhiIds', () => {
    const result = updateGatheringAttendanceSchema.safeParse({
      attendance: [
        entry('11111111-1111-1111-1111-111111111111'),
        entry('22222222-2222-2222-2222-222222222222'),
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects a repeated sakhiId within the same submission', () => {
    const result = updateGatheringAttendanceSchema.safeParse({
      attendance: [
        entry('11111111-1111-1111-1111-111111111111'),
        entry('11111111-1111-1111-1111-111111111111'),
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toMatch(/sakhiId must not repeat/);
    }
  });
});
