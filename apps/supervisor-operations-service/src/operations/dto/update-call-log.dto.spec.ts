import { updateCallLogSchema } from './update-call-log.dto';

describe('updateCallLogSchema', () => {
  it('rejects a future callEndAt', () => {
    const result = updateCallLogSchema.safeParse({
      callEndAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    expect(result.success).toBe(false);
  });

  it('accepts callEndAt equal to now', () => {
    const result = updateCallLogSchema.safeParse({
      callEndAt: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('accepts an update with no callEndAt at all', () => {
    const result = updateCallLogSchema.safeParse({ callStatus: 'NOT_PICKED_UP' });
    expect(result.success).toBe(true);
  });
});
