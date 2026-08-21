import { submitClosurePendingReasonSchema } from './submit-closure-pending-reason.dto';

describe('submitClosurePendingReasonSchema', () => {
  const baseInput = { pendingReasonLookupValueId: '11111111-1111-1111-1111-111111111111' };

  it('accepts a minimal payload', () => {
    expect(submitClosurePendingReasonSchema.safeParse(baseInput).success).toBe(true);
  });

  it('accepts notes when supplied', () => {
    expect(
      submitClosurePendingReasonSchema.safeParse({ ...baseInput, notes: 'Beneficiary moved' })
        .success,
    ).toBe(true);
  });

  it('rejects a missing pendingReasonLookupValueId', () => {
    expect(submitClosurePendingReasonSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a malformed pendingReasonLookupValueId', () => {
    expect(
      submitClosurePendingReasonSchema.safeParse({ pendingReasonLookupValueId: 'not-a-uuid' })
        .success,
    ).toBe(false);
  });

  it('rejects notes over 500 characters', () => {
    expect(
      submitClosurePendingReasonSchema.safeParse({ ...baseInput, notes: 'a'.repeat(501) }).success,
    ).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    expect(submitClosurePendingReasonSchema.safeParse({ ...baseInput, extra: 'x' }).success).toBe(
      false,
    );
  });
});
