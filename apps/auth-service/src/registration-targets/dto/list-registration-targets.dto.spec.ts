import { listRegistrationTargetsQuerySchema } from './list-registration-targets.dto';

describe('listRegistrationTargetsQuerySchema', () => {
  it('accepts a valid sakhiId', () => {
    const result = listRegistrationTargetsQuerySchema.safeParse({
      sakhiId: 'c9f8e2b1-6a3d-4f0e-9b1a-2d4e5f6a7b8c',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing sakhiId', () => {
    const result = listRegistrationTargetsQuerySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid sakhiId', () => {
    const result = listRegistrationTargetsQuerySchema.safeParse({ sakhiId: 'not-a-uuid' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown query field', () => {
    const result = listRegistrationTargetsQuerySchema.safeParse({
      sakhiId: 'c9f8e2b1-6a3d-4f0e-9b1a-2d4e5f6a7b8c',
      extra: '1',
    });
    expect(result.success).toBe(false);
  });
});
