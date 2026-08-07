import { createCallLogSchema } from './create-call-log.dto';

describe('createCallLogSchema', () => {
  const baseInput = {
    projectId: '22222222-2222-2222-2222-222222222222',
    sakhiId: '44444444-4444-4444-4444-444444444444',
    callDatetime: new Date('2026-07-01T09:00:00Z'),
    callStatus: 'PICKED_UP_TALKED' as const,
  };

  it('reproduces the reported bug payload as a clean validation error, not a crash', () => {
    const result = createCallLogSchema.safeParse({
      ...baseInput,
      callStartAt: new Date('2026-10-03T09:53:14Z'),
      callEndAt: new Date('2026-10-01T09:53:14Z'),
      callDurationSeconds: 0,
    });
    expect(result.success).toBe(false);
  });

  it('rejects callEndAt before callStartAt', () => {
    const result = createCallLogSchema.safeParse({
      ...baseInput,
      callStartAt: new Date(Date.now() - 60 * 60 * 1000),
      callEndAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
    });
    expect(result.success).toBe(false);
  });

  it('accepts callEndAt after callStartAt', () => {
    const start = new Date(Date.now() - 60 * 60 * 1000);
    const result = createCallLogSchema.safeParse({
      ...baseInput,
      callStartAt: start,
      callEndAt: new Date(start.getTime() + 5 * 60 * 1000),
    });
    expect(result.success).toBe(true);
  });

  it('accepts a call log with no callEndAt', () => {
    const result = createCallLogSchema.safeParse({
      ...baseInput,
      callStartAt: new Date(Date.now() - 60 * 60 * 1000),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a future callStartAt', () => {
    const result = createCallLogSchema.safeParse({
      ...baseInput,
      callStartAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    expect(result.success).toBe(false);
  });

  it('accepts callStartAt equal to now', () => {
    const now = new Date();
    const result = createCallLogSchema.safeParse({
      ...baseInput,
      callStartAt: now,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a future callEndAt', () => {
    const result = createCallLogSchema.safeParse({
      ...baseInput,
      callStartAt: new Date(Date.now() - 60 * 60 * 1000),
      callEndAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    expect(result.success).toBe(false);
  });

  it('accepts callStartAt equal to callEndAt', () => {
    const t = new Date(Date.now() - 60 * 60 * 1000);
    const result = createCallLogSchema.safeParse({
      ...baseInput,
      callStartAt: t,
      callEndAt: t,
    });
    expect(result.success).toBe(true);
  });
});
