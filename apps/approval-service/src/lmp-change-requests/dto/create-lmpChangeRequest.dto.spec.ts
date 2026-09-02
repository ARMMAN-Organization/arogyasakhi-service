import { createLmpChangeRequestSchema } from './create-lmpChangeRequest.dto';

describe('createLmpChangeRequestSchema', () => {
  const baseInput = {
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    newLmpDate: '2026-06-01',
    localRequestUuid: 'device-abc-lmp-001',
  };

  it('accepts a valid body without sonographyImageAssetId', () => {
    expect(createLmpChangeRequestSchema.safeParse(baseInput).success).toBe(true);
  });

  it('accepts a valid body with sonographyImageAssetId', () => {
    const result = createLmpChangeRequestSchema.safeParse({
      ...baseInput,
      sonographyImageAssetId: '33333333-3333-3333-3333-333333333333',
    });
    expect(result.success).toBe(true);
  });

  it('coerces newLmpDate to a Date', () => {
    const result = createLmpChangeRequestSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.newLmpDate).toBeInstanceOf(Date);
    }
  });

  it('rejects a missing beneficiaryId', () => {
    const { beneficiaryId: _omit, ...rest } = baseInput;
    expect(createLmpChangeRequestSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a missing newLmpDate', () => {
    const { newLmpDate: _omit, ...rest } = baseInput;
    expect(createLmpChangeRequestSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a missing localRequestUuid', () => {
    const { localRequestUuid: _omit, ...rest } = baseInput;
    expect(createLmpChangeRequestSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty localRequestUuid', () => {
    expect(
      createLmpChangeRequestSchema.safeParse({ ...baseInput, localRequestUuid: '' }).success,
    ).toBe(false);
  });

  it('rejects a localRequestUuid over 80 characters', () => {
    expect(
      createLmpChangeRequestSchema.safeParse({
        ...baseInput,
        localRequestUuid: 'x'.repeat(81),
      }).success,
    ).toBe(false);
  });

  it('rejects a non-uuid beneficiaryId', () => {
    expect(
      createLmpChangeRequestSchema.safeParse({ ...baseInput, beneficiaryId: 'not-a-uuid' }).success,
    ).toBe(false);
  });

  it('rejects a non-uuid sonographyImageAssetId', () => {
    expect(
      createLmpChangeRequestSchema.safeParse({
        ...baseInput,
        sonographyImageAssetId: 'not-a-uuid',
      }).success,
    ).toBe(false);
  });

  it('rejects an invalid newLmpDate', () => {
    expect(
      createLmpChangeRequestSchema.safeParse({ ...baseInput, newLmpDate: 'not-a-date' }).success,
    ).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    expect(
      createLmpChangeRequestSchema.safeParse({
        ...baseInput,
        requestedByUserId: '44444444-4444-4444-4444-444444444444',
      }).success,
    ).toBe(false);
  });
});
