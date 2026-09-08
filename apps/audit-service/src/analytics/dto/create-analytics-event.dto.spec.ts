import { MAX_BATCH_EVENTS, createAnalyticsEventBatchSchema } from './create-analytics-event.dto';

describe('createAnalyticsEventBatchSchema', () => {
  const baseEvent = {
    featureArea: 'ENROLLMENT',
    eventName: 'FORM_SUBMIT',
    occurredAt: '2026-09-08T10:15:00.000Z',
  };

  it('accepts a minimal valid batch of one event', () => {
    expect(createAnalyticsEventBatchSchema.safeParse({ events: [baseEvent] }).success).toBe(true);
  });

  it('accepts an event with all optional fields, including localEventUuid and payloadJson', () => {
    const result = createAnalyticsEventBatchSchema.safeParse({
      events: [
        {
          ...baseEvent,
          payloadJson: { sectionName: 'demographics', durationMs: 4200 },
          localEventUuid: 'device-abc-event-001',
        },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty events array', () => {
    expect(createAnalyticsEventBatchSchema.safeParse({ events: [] }).success).toBe(false);
  });

  it(`rejects a batch over ${MAX_BATCH_EVENTS} events`, () => {
    const events = Array.from({ length: MAX_BATCH_EVENTS + 1 }, () => baseEvent);
    expect(createAnalyticsEventBatchSchema.safeParse({ events }).success).toBe(false);
  });

  it(`accepts a batch at the ${MAX_BATCH_EVENTS}-event boundary`, () => {
    const events = Array.from({ length: MAX_BATCH_EVENTS }, () => baseEvent);
    expect(createAnalyticsEventBatchSchema.safeParse({ events }).success).toBe(true);
  });

  it('rejects a missing featureArea', () => {
    const { featureArea: _omit, ...rest } = baseEvent;
    expect(createAnalyticsEventBatchSchema.safeParse({ events: [rest] }).success).toBe(false);
  });

  it('rejects a missing eventName', () => {
    const { eventName: _omit, ...rest } = baseEvent;
    expect(createAnalyticsEventBatchSchema.safeParse({ events: [rest] }).success).toBe(false);
  });

  it('rejects a missing occurredAt', () => {
    const { occurredAt: _omit, ...rest } = baseEvent;
    expect(createAnalyticsEventBatchSchema.safeParse({ events: [rest] }).success).toBe(false);
  });

  it('rejects a non-datetime occurredAt', () => {
    expect(
      createAnalyticsEventBatchSchema.safeParse({
        events: [{ ...baseEvent, occurredAt: 'not-a-date' }],
      }).success,
    ).toBe(false);
  });

  it('accepts an occurredAt in the future (device clock skew tolerated, per SRS Sec 9.9)', () => {
    const futureDate = new Date(Date.now() + 1000 * 60 * 60 * 24 * 365).toISOString();
    expect(
      createAnalyticsEventBatchSchema.safeParse({
        events: [{ ...baseEvent, occurredAt: futureDate }],
      }).success,
    ).toBe(true);
  });

  it('rejects a localEventUuid over 80 characters', () => {
    expect(
      createAnalyticsEventBatchSchema.safeParse({
        events: [{ ...baseEvent, localEventUuid: 'x'.repeat(81) }],
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown extra field on an event', () => {
    expect(
      createAnalyticsEventBatchSchema.safeParse({
        events: [{ ...baseEvent, unexpectedField: 'x' }],
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown extra top-level field', () => {
    expect(
      createAnalyticsEventBatchSchema.safeParse({ events: [baseEvent], unexpectedField: 'x' })
        .success,
    ).toBe(false);
  });
});
