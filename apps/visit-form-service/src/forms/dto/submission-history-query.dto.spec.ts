import { submissionHistoryQuerySchema } from './submission-history-query.dto';

describe('submissionHistoryQuerySchema', () => {
  it('applies defaults when no query params are given', () => {
    const result = submissionHistoryQuerySchema.parse({});
    expect(result).toEqual({ limit: 50 });
  });

  it('accepts a valid limit', () => {
    const result = submissionHistoryQuerySchema.parse({ limit: '10' });
    expect(result.limit).toBe(10);
  });

  it('rejects limit=0', () => {
    expect(() => submissionHistoryQuerySchema.parse({ limit: '0' })).toThrow();
  });

  it('rejects limit > 100', () => {
    expect(() => submissionHistoryQuerySchema.parse({ limit: '1000' })).toThrow();
  });

  it('rejects a non-numeric limit', () => {
    expect(() => submissionHistoryQuerySchema.parse({ limit: 'abc' })).toThrow();
  });

  it('accepts an opaque cursor string without decoding it', () => {
    const result = submissionHistoryQuerySchema.parse({ cursor: 'some-opaque-cursor' });
    expect(result.cursor).toBe('some-opaque-cursor');
  });
});
