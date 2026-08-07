import { rescheduleEventSchema } from './reschedule-event.dto';

describe('rescheduleEventSchema', () => {
  it('rejects a past eventDate', () => {
    const result = rescheduleEventSchema.safeParse({
      eventDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a future eventDate', () => {
    const result = rescheduleEventSchema.safeParse({
      eventDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    expect(result.success).toBe(true);
  });

  it('accepts today as eventDate regardless of the current time of day', () => {
    // eventDate is @db.Date — a same-day value coerces to today's UTC
    // midnight, which is an instant in the past for all but the first
    // millisecond of the day. Regression test for that bug: this must pass
    // no matter what time "now" actually is when the test runs.
    const today = new Date();
    const todayDateOnly = new Date(
      Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
    );
    const result = rescheduleEventSchema.safeParse({ eventDate: todayDateOnly });
    expect(result.success).toBe(true);
  });

  it('rejects a remark shorter than 3 characters', () => {
    const result = rescheduleEventSchema.safeParse({
      eventDate: new Date(Date.now() + 60 * 60 * 1000),
      remarks: 'x',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid remark', () => {
    const result = rescheduleEventSchema.safeParse({
      eventDate: new Date(Date.now() + 60 * 60 * 1000),
      remarks: 'Rescheduled per Sakhi request',
    });
    expect(result.success).toBe(true);
  });
});
