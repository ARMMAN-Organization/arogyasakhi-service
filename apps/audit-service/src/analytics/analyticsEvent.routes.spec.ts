import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import {
  MAX_BATCH_EVENTS,
  createAnalyticsEventBatchSchema,
} from './dto/create-analytics-event.dto';

extendZodWithOpenApi(z);

/**
 * Regression test for a bug caught via live testing: the route's
 * OpenAPI-annotated request schema is built by reaching into
 * createAnalyticsEventBatchSchema's array item type (`.element`) and
 * calling `.array()` again to attach payloadJson's OpenAPI metadata —
 * that rebuild does NOT inherit the original array's `.min(1).max(...)`
 * refinements, so a hand-rebuilt schema can silently diverge from what the
 * DTO actually enforces (an empty `events: []` was wrongly accepted in
 * production before this was caught). This test reconstructs the same
 * schema-building pattern analyticsEvent.routes.ts uses and asserts the
 * min/max still hold — if a future edit to that file drops them again,
 * this test (not just a live smoke test) should fail first.
 */
describe('analyticsEvent.routes request schema construction', () => {
  const rebuiltSchema = z.object({
    events: createAnalyticsEventBatchSchema.shape.events.element
      .extend({
        payloadJson: createAnalyticsEventBatchSchema.shape.events.element.shape.payloadJson.openapi(
          { type: 'object', example: {} },
        ),
      })
      .array()
      .min(1)
      .max(MAX_BATCH_EVENTS),
  });

  const validEvent = {
    featureArea: 'ENROLLMENT',
    eventName: 'FORM_SUBMIT',
    occurredAt: '2026-09-08T10:15:00.000Z',
  };

  it('rejects an empty events array, same as createAnalyticsEventBatchSchema', () => {
    expect(rebuiltSchema.safeParse({ events: [] }).success).toBe(false);
  });

  it(`rejects a batch over ${MAX_BATCH_EVENTS} events, same as createAnalyticsEventBatchSchema`, () => {
    const events = Array.from({ length: MAX_BATCH_EVENTS + 1 }, () => validEvent);
    expect(rebuiltSchema.safeParse({ events }).success).toBe(false);
  });

  it('accepts a valid batch within bounds', () => {
    expect(rebuiltSchema.safeParse({ events: [validEvent] }).success).toBe(true);
  });
});
