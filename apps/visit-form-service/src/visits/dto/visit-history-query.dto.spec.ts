import { visitHistoryQuerySchema } from './visit-history-query.dto';

describe('visitHistoryQuerySchema', () => {
  it('defaults limit to 2 when omitted', () => {
    const result = visitHistoryQuerySchema.parse({});

    expect(result).toEqual({ limit: 2 });
  });

  it('coerces a query-string limit to a number', () => {
    const result = visitHistoryQuerySchema.parse({ limit: '1' });

    expect(result.limit).toBe(1);
  });

  it('accepts a single formCode and a single visitType', () => {
    const result = visitHistoryQuerySchema.parse({ formCode: 'ANC_VISIT', visitType: 'ANC' });

    expect(result).toEqual({ formCode: 'ANC_VISIT', visitType: 'ANC', limit: 2 });
  });

  it('accepts repeated formCode/visitType as arrays', () => {
    const result = visitHistoryQuerySchema.parse({
      formCode: ['ANC_VISIT', 'POSTPARTUM_VISIT'],
      visitType: ['ANC', 'PP'],
    });

    expect(result.formCode).toEqual(['ANC_VISIT', 'POSTPARTUM_VISIT']);
    expect(result.visitType).toEqual(['ANC', 'PP']);
  });

  it('rejects a limit below 1', () => {
    expect(() => visitHistoryQuerySchema.parse({ limit: '0' })).toThrow();
  });

  it('rejects a non-integer limit', () => {
    expect(() => visitHistoryQuerySchema.parse({ limit: '1.5' })).toThrow();
  });

  it('rejects an unknown query param (.strict())', () => {
    expect(() => visitHistoryQuerySchema.parse({ limit: '2', bogus: 'x' })).toThrow();
  });
});
