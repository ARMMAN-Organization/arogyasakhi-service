import { listFormSubmissionsQuerySchema } from './list-form-submissions.dto';

describe('listFormSubmissionsQuerySchema', () => {
  it('defaults limit to 50 when omitted', () => {
    const result = listFormSubmissionsQuerySchema.parse({});

    expect(result).toEqual({ limit: 50 });
  });

  it('coerces a query-string limit to a number', () => {
    const result = listFormSubmissionsQuerySchema.parse({ limit: '10' });

    expect(result.limit).toBe(10);
  });

  it('accepts a valid sakhiId and cursor', () => {
    const result = listFormSubmissionsQuerySchema.parse({
      sakhiId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      cursor: 'some-opaque-cursor',
    });

    expect(result.sakhiId).toBe('3fa85f64-5717-4562-b3fc-2c963f66afa6');
    expect(result.cursor).toBe('some-opaque-cursor');
  });

  it('rejects a non-uuid sakhiId', () => {
    expect(() => listFormSubmissionsQuerySchema.parse({ sakhiId: 'not-a-uuid' })).toThrow();
  });

  it('rejects limit above 100', () => {
    expect(() => listFormSubmissionsQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('rejects limit below 1', () => {
    expect(() => listFormSubmissionsQuerySchema.parse({ limit: '0' })).toThrow();
  });

  it('rejects a non-integer limit', () => {
    expect(() => listFormSubmissionsQuerySchema.parse({ limit: '1.5' })).toThrow();
  });

  it('rejects an empty-string cursor', () => {
    expect(() => listFormSubmissionsQuerySchema.parse({ cursor: '' })).toThrow();
  });

  it('rejects an unknown query param (.strict())', () => {
    expect(() => listFormSubmissionsQuerySchema.parse({ foo: 'bar' })).toThrow();
  });
});
