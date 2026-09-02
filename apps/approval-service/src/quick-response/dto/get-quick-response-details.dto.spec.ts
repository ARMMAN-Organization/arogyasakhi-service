import {
  getQuickResponseDetailsSchema,
  MAX_BATCH_CARD_IDS,
  parseCardIdsParam,
} from './get-quick-response-details.dto';

describe('getQuickResponseDetailsSchema', () => {
  it('accepts a single uuid', () => {
    expect(
      getQuickResponseDetailsSchema.safeParse({ cardIds: '11111111-1111-1111-1111-111111111111' })
        .success,
    ).toBe(true);
  });

  it('accepts a comma-separated list of uuids', () => {
    const result = getQuickResponseDetailsSchema.safeParse({
      cardIds: '11111111-1111-1111-1111-111111111111,22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty string', () => {
    expect(getQuickResponseDetailsSchema.safeParse({ cardIds: '' }).success).toBe(false);
  });

  it('rejects a missing cardIds param', () => {
    expect(getQuickResponseDetailsSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-uuid token in the list', () => {
    expect(
      getQuickResponseDetailsSchema.safeParse({
        cardIds: '11111111-1111-1111-1111-111111111111,not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it(`accepts exactly ${MAX_BATCH_CARD_IDS} ids`, () => {
    const cardIds = Array.from(
      { length: MAX_BATCH_CARD_IDS },
      () => '11111111-1111-1111-1111-111111111111',
    ).join(',');
    expect(getQuickResponseDetailsSchema.safeParse({ cardIds }).success).toBe(true);
  });

  it(`rejects more than ${MAX_BATCH_CARD_IDS} ids`, () => {
    const cardIds = Array.from(
      { length: MAX_BATCH_CARD_IDS + 1 },
      () => '11111111-1111-1111-1111-111111111111',
    ).join(',');
    expect(getQuickResponseDetailsSchema.safeParse({ cardIds }).success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    expect(
      getQuickResponseDetailsSchema.safeParse({
        cardIds: '11111111-1111-1111-1111-111111111111',
        extraField: 'x',
      }).success,
    ).toBe(false);
  });
});

describe('parseCardIdsParam', () => {
  it('splits and trims a comma-separated list', () => {
    expect(parseCardIdsParam(' a , b ,c')).toEqual(['a', 'b', 'c']);
  });

  it('drops empty entries', () => {
    expect(parseCardIdsParam('a,,b')).toEqual(['a', 'b']);
  });
});
