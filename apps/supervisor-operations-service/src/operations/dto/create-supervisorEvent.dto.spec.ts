import { createSupervisorEventSchema } from './create-supervisorEvent.dto';

describe('createSupervisorEventSchema', () => {
  const baseInput = {
    projectId: '22222222-2222-2222-2222-222222222222',
    supervisorId: '33333333-3333-3333-3333-333333333333',
    eventType: 'MEETING' as const,
    topicsJson: { agenda: 'review' },
    status: 'SCHEDULED' as const,
  };

  it('rejects a past eventDate', () => {
    const result = createSupervisorEventSchema.safeParse({
      ...baseInput,
      eventDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['eventDate']);
    }
  });

  it('accepts a future eventDate', () => {
    const result = createSupervisorEventSchema.safeParse({
      ...baseInput,
      eventDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    expect(result.success).toBe(true);
  });

  it('rejects a remark shorter than 3 characters', () => {
    const result = createSupervisorEventSchema.safeParse({
      ...baseInput,
      eventDate: new Date(Date.now() + 60 * 60 * 1000),
      remarks: 'ab',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['remarks']);
    }
  });

  it('accepts a remark of exactly 3 characters', () => {
    const result = createSupervisorEventSchema.safeParse({
      ...baseInput,
      eventDate: new Date(Date.now() + 60 * 60 * 1000),
      remarks: 'abc',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an omitted remark', () => {
    const result = createSupervisorEventSchema.safeParse({
      ...baseInput,
      eventDate: new Date(Date.now() + 60 * 60 * 1000),
    });
    expect(result.success).toBe(true);
  });
});
