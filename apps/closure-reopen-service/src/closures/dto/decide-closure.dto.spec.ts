import { decideClosureSchema } from './decide-closure.dto';

describe('decideClosureSchema', () => {
  it('accepts APPROVED with no supervisorNotes', () => {
    expect(decideClosureSchema.safeParse({ decision: 'APPROVED' }).success).toBe(true);
  });

  it('accepts REJECTED with supervisorNotes', () => {
    const result = decideClosureSchema.safeParse({
      decision: 'REJECTED',
      supervisorNotes: 'Beneficiary confirmed not returning.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid decision value', () => {
    expect(decideClosureSchema.safeParse({ decision: 'MAYBE' }).success).toBe(false);
  });

  it('rejects an empty-string supervisorNotes', () => {
    const result = decideClosureSchema.safeParse({ decision: 'APPROVED', supervisorNotes: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    const result = decideClosureSchema.safeParse({ decision: 'APPROVED', extraField: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects a missing decision', () => {
    expect(decideClosureSchema.safeParse({}).success).toBe(false);
  });
});
