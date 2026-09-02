import {
  escalationEventsByIdsQuerySchema,
  MAX_BATCH_ESCALATION_EVENT_IDS,
} from './escalation-events-by-ids-query.dto';

describe('escalationEventsByIdsQuerySchema', () => {
  it('accepts a single uuid', () => {
    expect(
      escalationEventsByIdsQuerySchema.safeParse({ ids: '11111111-1111-1111-1111-111111111111' })
        .success,
    ).toBe(true);
  });

  it('accepts a comma-separated list of uuids', () => {
    const result = escalationEventsByIdsQuerySchema.safeParse({
      ids: '11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(escalationEventsByIdsQuerySchema.safeParse({ ids: '' }).success).toBe(false);
  });

  it('rejects a missing ids param', () => {
    expect(escalationEventsByIdsQuerySchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-uuid token in the list', () => {
    expect(
      escalationEventsByIdsQuerySchema.safeParse({
        ids: '11111111-1111-1111-1111-111111111111,not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it(`rejects more than ${MAX_BATCH_ESCALATION_EVENT_IDS} ids`, () => {
    const ids = Array.from(
      { length: MAX_BATCH_ESCALATION_EVENT_IDS + 1 },
      () => '11111111-1111-1111-1111-111111111111',
    ).join(',');
    expect(escalationEventsByIdsQuerySchema.safeParse({ ids }).success).toBe(false);
  });

  it(`accepts exactly ${MAX_BATCH_ESCALATION_EVENT_IDS} ids`, () => {
    const ids = Array.from(
      { length: MAX_BATCH_ESCALATION_EVENT_IDS },
      () => '11111111-1111-1111-1111-111111111111',
    ).join(',');
    expect(escalationEventsByIdsQuerySchema.safeParse({ ids }).success).toBe(true);
  });

  it('rejects an unknown extra field', () => {
    expect(
      escalationEventsByIdsQuerySchema.safeParse({
        ids: '11111111-1111-1111-1111-111111111111',
        extraField: 'x',
      }).success,
    ).toBe(false);
  });
});
