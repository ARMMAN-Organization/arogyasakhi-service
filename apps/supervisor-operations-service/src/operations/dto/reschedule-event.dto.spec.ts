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
