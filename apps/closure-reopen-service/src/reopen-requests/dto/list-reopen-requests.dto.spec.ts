import { listReopenRequestsQuerySchema } from './list-reopen-requests.dto';

describe('listReopenRequestsQuerySchema', () => {
  it('defaults limit to 50 when omitted', () => {
    const result = listReopenRequestsQuerySchema.parse({});

    expect(result).toEqual({ limit: 50 });
  });

  it('coerces a query-string limit to a number', () => {
    const result = listReopenRequestsQuerySchema.parse({ limit: '10' });

    expect(result.limit).toBe(10);
  });

  it('accepts a valid sakhiId and cursor', () => {
    const result = listReopenRequestsQuerySchema.parse({
      sakhiId: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
      cursor: 'some-opaque-cursor',
    });

    expect(result.sakhiId).toBe('3fa85f64-5717-4562-b3fc-2c963f66afa6');
    expect(result.cursor).toBe('some-opaque-cursor');
  });

  it('rejects a non-uuid sakhiId', () => {
    expect(() => listReopenRequestsQuerySchema.parse({ sakhiId: 'not-a-uuid' })).toThrow();
  });

  it('rejects limit above 100', () => {
    expect(() => listReopenRequestsQuerySchema.parse({ limit: '101' })).toThrow();
  });

  it('rejects limit below 1', () => {
    expect(() => listReopenRequestsQuerySchema.parse({ limit: '0' })).toThrow();
  });

  it('rejects a non-integer limit', () => {
    expect(() => listReopenRequestsQuerySchema.parse({ limit: '1.5' })).toThrow();
  });

  it('rejects an empty-string cursor', () => {
    expect(() => listReopenRequestsQuerySchema.parse({ cursor: '' })).toThrow();
  });

  it('rejects an unknown query param (.strict())', () => {
    expect(() => listReopenRequestsQuerySchema.parse({ foo: 'bar' })).toThrow();
  });
});
