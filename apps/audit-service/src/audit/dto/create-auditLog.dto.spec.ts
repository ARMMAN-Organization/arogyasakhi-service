import { createAuditLogSchema } from './create-auditLog.dto';

describe('createAuditLogSchema', () => {
  const baseInput = {
    action: 'CREATE',
    entityType: 'Beneficiary',
  };

  it('accepts a minimal valid body', () => {
    expect(createAuditLogSchema.safeParse(baseInput).success).toBe(true);
  });

  it('accepts a body with all optional fields, including localAuditUuid', () => {
    const result = createAuditLogSchema.safeParse({
      ...baseInput,
      actorUserId: 'user-1',
      entityId: 'entity-1',
      beforeJson: { status: 'draft' },
      afterJson: { status: 'active' },
      ipAddress: '127.0.0.1',
      deviceId: 'device-1',
      localAuditUuid: 'device-abc-audit-001',
    });
    expect(result.success).toBe(true);
  });

  it('is valid without localAuditUuid (optional)', () => {
    const result = createAuditLogSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.localAuditUuid).toBeUndefined();
    }
  });

  it('rejects an empty localAuditUuid', () => {
    expect(createAuditLogSchema.safeParse({ ...baseInput, localAuditUuid: '' }).success).toBe(
      false,
    );
  });

  it('rejects a localAuditUuid over 80 characters', () => {
    expect(
      createAuditLogSchema.safeParse({ ...baseInput, localAuditUuid: 'x'.repeat(81) }).success,
    ).toBe(false);
  });

  it('accepts a localAuditUuid at the 80 character boundary', () => {
    expect(
      createAuditLogSchema.safeParse({ ...baseInput, localAuditUuid: 'x'.repeat(80) }).success,
    ).toBe(true);
  });

  it('rejects a missing action', () => {
    const { action: _omit, ...rest } = baseInput;
    expect(createAuditLogSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects a missing entityType', () => {
    const { entityType: _omit, ...rest } = baseInput;
    expect(createAuditLogSchema.safeParse(rest).success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    expect(createAuditLogSchema.safeParse({ ...baseInput, unexpectedField: 'x' }).success).toBe(
      false,
    );
  });
});
