import { createEscalationEventSchema } from './create-escalation-event.dto';

describe('createEscalationEventSchema', () => {
  const baseInput = {
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    escalationType: 'ANC_2_MISSED' as const,
  };

  it('accepts a minimal Missed-Visit-type payload', () => {
    const result = createEscalationEventSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it('accepts an EDD_NEARING payload', () => {
    const result = createEscalationEventSchema.safeParse({
      ...baseInput,
      escalationType: 'EDD_NEARING' as const,
    });
    expect(result.success).toBe(true);
  });

  it('accepts the optional fields when supplied', () => {
    const result = createEscalationEventSchema.safeParse({
      ...baseInput,
      visitId: '33333333-3333-3333-3333-333333333333',
      referralId: '44444444-4444-4444-4444-444444444444',
      visitsMissedCount: 2,
      assignedSupervisorId: '55555555-5555-5555-5555-555555555555',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing beneficiaryId', () => {
    const result = createEscalationEventSchema.safeParse({
      escalationType: baseInput.escalationType,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an escalationType outside the enum', () => {
    const result = createEscalationEventSchema.safeParse({
      ...baseInput,
      escalationType: 'NOT_A_REAL_TYPE',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid beneficiaryId', () => {
    const result = createEscalationEventSchema.safeParse({
      ...baseInput,
      beneficiaryId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a client-supplied status field', () => {
    const result = createEscalationEventSchema.safeParse({
      ...baseInput,
      status: 'OPEN',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a SYNC_DELAY payload with sakhiUserId instead of beneficiaryId', () => {
    const result = createEscalationEventSchema.safeParse({
      sakhiUserId: '66666666-6666-6666-6666-666666666666',
      escalationType: 'SYNC_DELAY' as const,
    });
    expect(result.success).toBe(true);
  });

  it('rejects both beneficiaryId and sakhiUserId set at once', () => {
    const result = createEscalationEventSchema.safeParse({
      ...baseInput,
      sakhiUserId: '66666666-6666-6666-6666-666666666666',
    });
    expect(result.success).toBe(false);
  });

  it('rejects neither beneficiaryId nor sakhiUserId set', () => {
    const result = createEscalationEventSchema.safeParse({
      escalationType: baseInput.escalationType,
    });
    expect(result.success).toBe(false);
  });
});
