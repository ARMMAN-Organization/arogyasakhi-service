import { createReferralSchema } from './create-referral.dto';

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    referralTypeLookupValueId: '33333333-3333-3333-3333-333333333333',
    referralDate: '2026-08-20',
    status: 'PENDING_FOLLOWUP',
    ...overrides,
  };
}

describe('createReferralSchema — photoEvidenceMediaAssetId', () => {
  it('accepts a valid uuid', () => {
    const result = createReferralSchema.safeParse(
      baseInput({ photoEvidenceMediaAssetId: '44444444-4444-4444-4444-444444444444' }),
    );
    expect(result.success).toBe(true);
  });

  it('is optional — omitting it still parses', () => {
    const result = createReferralSchema.safeParse(baseInput());
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.photoEvidenceMediaAssetId).toBeUndefined();
  });

  it('rejects a non-uuid value', () => {
    const result = createReferralSchema.safeParse(
      baseInput({ photoEvidenceMediaAssetId: 'not-a-uuid' }),
    );
    expect(result.success).toBe(false);
  });
});
