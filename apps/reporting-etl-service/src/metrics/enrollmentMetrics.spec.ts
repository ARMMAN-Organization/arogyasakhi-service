import type { AnalyticsEventRecord } from '../analytics-client/analyticsEvent.client';
import { computeEnrollmentMetrics } from './enrollmentMetrics';

function event(overrides: Partial<AnalyticsEventRecord> = {}): AnalyticsEventRecord {
  return {
    id: 'event-1',
    sakhiUserId: 'sakhi-1',
    eventName: 'FORM_OPEN',
    occurredAt: '2026-09-08T10:00:00.000Z',
    payloadJson: null,
    ...overrides,
  };
}

describe('computeEnrollmentMetrics', () => {
  it('returns null dropOffRate when no forms were started', () => {
    const result = computeEnrollmentMetrics([]);
    expect(result.dropOffRate).toBeNull();
  });

  it('computes dropOffRate as (Started - Submitted) / Started', () => {
    const events = [
      event({ id: '1', eventName: 'FORM_OPEN' }),
      event({ id: '2', eventName: 'FORM_OPEN' }),
      event({ id: '3', eventName: 'FORM_OPEN' }),
      event({ id: '4', eventName: 'FORM_SUBMIT' }),
    ];

    const result = computeEnrollmentMetrics(events);

    expect(result.dropOffRate).toBeCloseTo(2 / 3);
  });

  it('returns dropOffRate 0 when every started form was submitted', () => {
    const events = [
      event({ id: '1', eventName: 'FORM_OPEN' }),
      event({ id: '2', eventName: 'FORM_SUBMIT' }),
    ];

    expect(computeEnrollmentMetrics(events).dropOffRate).toBe(0);
  });

  it('computes averageFormCompletionTimeMs from matched sessionId pairs', () => {
    const events = [
      event({
        id: '1',
        eventName: 'FORM_OPEN',
        occurredAt: '2026-09-08T10:00:00.000Z',
        payloadJson: { sessionId: 'session-1' },
      }),
      event({
        id: '2',
        eventName: 'FORM_SUBMIT',
        occurredAt: '2026-09-08T10:00:42.000Z',
        payloadJson: { sessionId: 'session-1' },
      }),
    ];

    const result = computeEnrollmentMetrics(events);

    expect(result.averageFormCompletionTimeMs).toBe(42000);
  });

  it('excludes a FORM_SUBMIT with no matching sessionId from completion-time, but still counts it for drop-off/per-Sakhi', () => {
    const events = [
      event({ id: '1', eventName: 'FORM_OPEN', payloadJson: { sessionId: 'session-1' } }),
      event({ id: '2', eventName: 'FORM_SUBMIT', payloadJson: null }),
    ];

    const result = computeEnrollmentMetrics(events);

    expect(result.averageFormCompletionTimeMs).toBeNull();
    expect(result.dropOffRate).toBe(0);
  });

  it('averages completion time across multiple matched sessions', () => {
    const events = [
      event({
        id: '1',
        eventName: 'FORM_OPEN',
        occurredAt: '2026-09-08T10:00:00.000Z',
        payloadJson: { sessionId: 'session-1' },
      }),
      event({
        id: '2',
        eventName: 'FORM_SUBMIT',
        occurredAt: '2026-09-08T10:00:10.000Z',
        payloadJson: { sessionId: 'session-1' },
      }),
      event({
        id: '3',
        eventName: 'FORM_OPEN',
        occurredAt: '2026-09-08T11:00:00.000Z',
        payloadJson: { sessionId: 'session-2' },
      }),
      event({
        id: '4',
        eventName: 'FORM_SUBMIT',
        occurredAt: '2026-09-08T11:00:30.000Z',
        payloadJson: { sessionId: 'session-2' },
      }),
    ];

    const result = computeEnrollmentMetrics(events);

    expect(result.averageFormCompletionTimeMs).toBe(20000); // (10000 + 30000) / 2
  });

  it('groups enrollmentsPerSakhi by sakhiUserId, counting only FORM_SUBMIT events', () => {
    const events = [
      event({ id: '1', eventName: 'FORM_OPEN', sakhiUserId: 'sakhi-1' }),
      event({ id: '2', eventName: 'FORM_SUBMIT', sakhiUserId: 'sakhi-1' }),
      event({ id: '3', eventName: 'FORM_SUBMIT', sakhiUserId: 'sakhi-1' }),
      event({ id: '4', eventName: 'FORM_SUBMIT', sakhiUserId: 'sakhi-2' }),
    ];

    const result = computeEnrollmentMetrics(events);

    expect(result.enrollmentsPerSakhi).toEqual(
      new Map([
        ['sakhi-1', 2],
        ['sakhi-2', 1],
      ]),
    );
  });

  it('excludes a FORM_SUBMIT event with no sakhiUserId from the per-Sakhi breakdown', () => {
    const events = [event({ id: '1', eventName: 'FORM_SUBMIT', sakhiUserId: null })];

    const result = computeEnrollmentMetrics(events);

    expect(result.enrollmentsPerSakhi.size).toBe(0);
  });

  it('ignores a negative delta (out-of-order events) rather than skewing the average', () => {
    const events = [
      event({
        id: '1',
        eventName: 'FORM_OPEN',
        occurredAt: '2026-09-08T10:00:10.000Z',
        payloadJson: { sessionId: 'session-1' },
      }),
      event({
        id: '2',
        eventName: 'FORM_SUBMIT',
        occurredAt: '2026-09-08T10:00:00.000Z',
        payloadJson: { sessionId: 'session-1' },
      }),
    ];

    const result = computeEnrollmentMetrics(events);

    expect(result.averageFormCompletionTimeMs).toBeNull();
  });
});
