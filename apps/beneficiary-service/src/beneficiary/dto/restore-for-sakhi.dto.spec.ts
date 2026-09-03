import { restoreForSakhiSchema } from './restore-for-sakhi.dto';

describe('restoreForSakhiSchema', () => {
  it('accepts a valid sakhiUserId', () => {
    expect(
      restoreForSakhiSchema.safeParse({
        sakhiUserId: '11111111-1111-1111-1111-111111111111',
      }).success,
    ).toBe(true);
  });

  it('rejects a missing sakhiUserId', () => {
    expect(restoreForSakhiSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a non-uuid sakhiUserId', () => {
    expect(restoreForSakhiSchema.safeParse({ sakhiUserId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    expect(
      restoreForSakhiSchema.safeParse({
        sakhiUserId: '11111111-1111-1111-1111-111111111111',
        extraField: 'x',
      }).success,
    ).toBe(false);
  });
});
