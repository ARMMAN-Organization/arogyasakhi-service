import { createGatheringSchema } from './create-gathering.dto';

describe('createGatheringSchema', () => {
  const base = {
    gatheringDate: '2026-08-01',
    topicIds: ['11111111-1111-1111-1111-111111111111'],
  };

  it('accepts a valid payload with one topic', () => {
    const result = createGatheringSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('accepts multiple topics and optional remarks', () => {
    const result = createGatheringSchema.safeParse({
      ...base,
      topicIds: ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
      remarks: 'First session',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty topicIds array', () => {
    const result = createGatheringSchema.safeParse({ ...base, topicIds: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid topicId', () => {
    const result = createGatheringSchema.safeParse({ ...base, topicIds: ['not-a-uuid'] });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown field (.strict())', () => {
    const result = createGatheringSchema.safeParse({ ...base, extra: 'nope' });
    expect(result.success).toBe(false);
  });
});
