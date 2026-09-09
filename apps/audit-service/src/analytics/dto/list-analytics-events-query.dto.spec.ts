import { listAnalyticsEventsQuerySchema } from './list-analytics-events-query.dto';

describe('listAnalyticsEventsQuerySchema', () => {
  const baseQuery = {
    featureArea: 'ENROLLMENT',
    since: '2026-09-01T00:00:00.000Z',
    until: '2026-09-02T00:00:00.000Z',
  };

  it('accepts a minimal valid query', () => {
    expect(listAnalyticsEventsQuerySchema.safeParse(baseQuery).success).toBe(true);
  });

  it('applies the default limit of 200 when omitted', () => {
    const result = listAnalyticsEventsQuerySchema.safeParse(baseQuery);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.limit).toBe(200);
  });

  it('accepts a cursor and a custom limit', () => {
    const result = listAnalyticsEventsQuerySchema.safeParse({
      ...baseQuery,
      cursor: 'opaque-cursor-value',
      limit: '50',
    });
    expect(result.success).toBe(true);
  });

  it('rejects since on or after until', () => {
    expect(
      listAnalyticsEventsQuerySchema.safeParse({
        ...baseQuery,
        since: '2026-09-02T00:00:00.000Z',
        until: '2026-09-02T00:00:00.000Z',
      }).success,
    ).toBe(false);
  });

  it('rejects a limit over 500', () => {
    expect(listAnalyticsEventsQuerySchema.safeParse({ ...baseQuery, limit: '501' }).success).toBe(
      false,
    );
  });

  it('rejects a missing featureArea', () => {
    const { featureArea: _omit, ...rest } = baseQuery;
    expect(listAnalyticsEventsQuerySchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    expect(
      listAnalyticsEventsQuerySchema.safeParse({ ...baseQuery, unexpectedField: 'x' }).success,
    ).toBe(false);
  });
});
