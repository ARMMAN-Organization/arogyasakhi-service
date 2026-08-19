import { createClosureSchema } from './create-closure.dto';

const validBase = {
  localClosureUuid: 'device-abc-closure-001',
  beneficiaryId: '22222222-2222-2222-2222-222222222222',
  closureType: 'MEDICAL' as const,
  closureReasonLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  closureDate: '2026-06-05',
  submittedByUserId: '33333333-3333-3333-3333-333333333333',
};

describe('createClosureSchema', () => {
  it('accepts a valid minimal closure', () => {
    expect(createClosureSchema.safeParse(validBase).success).toBe(true);
  });

  it('accepts an optional eventDate', () => {
    const result = createClosureSchema.safeParse({
      ...validBase,
      eventDate: '2026-06-01',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a client-supplied supervisorStatus — server-derived only, never client input', () => {
    const result = createClosureSchema.safeParse({ ...validBase, supervisorStatus: 'APPROVED' });
    expect(result.success).toBe(false);
  });

  it('rejects a client-supplied supervisorId', () => {
    const result = createClosureSchema.safeParse({
      ...validBase,
      supervisorId: '44444444-4444-4444-4444-444444444444',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing localClosureUuid', () => {
    const { localClosureUuid: _omit, ...rest } = validBase;
    expect(createClosureSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an empty localClosureUuid', () => {
    expect(createClosureSchema.safeParse({ ...validBase, localClosureUuid: '' }).success).toBe(
      false,
    );
  });

  it('rejects a localClosureUuid over 80 characters', () => {
    expect(
      createClosureSchema.safeParse({ ...validBase, localClosureUuid: 'x'.repeat(81) }).success,
    ).toBe(false);
  });

  it('rejects an invalid closureType', () => {
    expect(createClosureSchema.safeParse({ ...validBase, closureType: 'MIGRATION' }).success).toBe(
      false,
    );
  });

  it('rejects an unknown extra field', () => {
    expect(createClosureSchema.safeParse({ ...validBase, extra: 'x' }).success).toBe(false);
  });
});
