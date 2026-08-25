import {
  listPublishedContentQuerySchema,
  MAX_BATCH_RULE_SET_IDS,
} from './list-published-content.dto';

const SET_ID_1 = '11111111-1111-1111-1111-111111111111';
const SET_ID_2 = '22222222-2222-2222-2222-222222222222';

describe('listPublishedContentQuerySchema', () => {
  it('accepts a single setId', () => {
    const result = listPublishedContentQuerySchema.safeParse({ setIds: SET_ID_1 });
    expect(result.success).toBe(true);
  });

  it('accepts a comma-separated batch of setIds', () => {
    const result = listPublishedContentQuerySchema.safeParse({
      setIds: `${SET_ID_1},${SET_ID_2}`,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing setIds', () => {
    const result = listPublishedContentQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid setIds segment', () => {
    const result = listPublishedContentQuerySchema.safeParse({ setIds: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects a batch containing one non-uuid segment among valid ones', () => {
    const result = listPublishedContentQuerySchema.safeParse({
      setIds: `${SET_ID_1},not-a-uuid`,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a setIds batch larger than the max', () => {
    const setIds = Array.from({ length: MAX_BATCH_RULE_SET_IDS + 1 }, () => SET_ID_1).join(',');
    const result = listPublishedContentQuerySchema.safeParse({ setIds });
    expect(result.success).toBe(false);
  });

  it('accepts a setIds batch exactly at the max', () => {
    const setIds = Array.from({ length: MAX_BATCH_RULE_SET_IDS }, () => SET_ID_1).join(',');
    const result = listPublishedContentQuerySchema.safeParse({ setIds });
    expect(result.success).toBe(true);
  });

  it('rejects unknown fields', () => {
    const result = listPublishedContentQuerySchema.safeParse({ setIds: SET_ID_1, extra: 'nope' });
    expect(result.success).toBe(false);
  });
});
