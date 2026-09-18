import { applyDeliveryDateSchema } from './apply-delivery-date.dto';

describe('applyDeliveryDateSchema', () => {
  it('accepts a valid dateOfDelivery', () => {
    expect(applyDeliveryDateSchema.safeParse({ dateOfDelivery: '2026-06-15' }).success).toBe(true);
  });

  it('rejects a missing dateOfDelivery', () => {
    expect(applyDeliveryDateSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an invalid date string', () => {
    expect(applyDeliveryDateSchema.safeParse({ dateOfDelivery: 'not-a-date' }).success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    const result = applyDeliveryDateSchema.safeParse({ dateOfDelivery: '2026-06-15', extra: 'x' });
    expect(result.success).toBe(false);
  });
});
