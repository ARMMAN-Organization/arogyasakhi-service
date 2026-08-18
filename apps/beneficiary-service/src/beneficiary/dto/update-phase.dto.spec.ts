import { updatePhaseSchema } from './update-phase.dto';

describe('updatePhaseSchema', () => {
  it('accepts phase: PP', () => {
    expect(updatePhaseSchema.safeParse({ phase: 'PP' }).success).toBe(true);
  });

  it('accepts phase: NN', () => {
    expect(updatePhaseSchema.safeParse({ phase: 'NN' }).success).toBe(true);
  });

  it('rejects a missing phase', () => {
    expect(updatePhaseSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a phase value outside CasePhase', () => {
    expect(updatePhaseSchema.safeParse({ phase: 'FOO' }).success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    const result = updatePhaseSchema.safeParse({ phase: 'PP', extra: 'x' });
    expect(result.success).toBe(false);
  });
});
