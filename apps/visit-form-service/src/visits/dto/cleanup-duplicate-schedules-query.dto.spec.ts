import { cleanupDuplicateSchedulesQuerySchema } from './cleanup-duplicate-schedules-query.dto';

describe('cleanupDuplicateSchedulesQuerySchema', () => {
  it('leaves dryRun undefined when omitted — controller treats that as true', () => {
    const result = cleanupDuplicateSchedulesQuerySchema.parse({});

    expect(result).toEqual({});
  });

  it('parses dryRun=false as the literal string "false"', () => {
    const result = cleanupDuplicateSchedulesQuerySchema.parse({ dryRun: 'false' });

    expect(result).toEqual({ dryRun: 'false' });
  });

  it('parses dryRun=true as the literal string "true"', () => {
    const result = cleanupDuplicateSchedulesQuerySchema.parse({ dryRun: 'true' });

    expect(result).toEqual({ dryRun: 'true' });
  });

  it('rejects a value other than "true"/"false"', () => {
    expect(cleanupDuplicateSchedulesQuerySchema.safeParse({ dryRun: 'maybe' }).success).toBe(false);
  });

  it('rejects unknown query params (.strict())', () => {
    expect(
      cleanupDuplicateSchedulesQuerySchema.safeParse({ dryRun: 'true', extra: '1' }).success,
    ).toBe(false);
  });
});
