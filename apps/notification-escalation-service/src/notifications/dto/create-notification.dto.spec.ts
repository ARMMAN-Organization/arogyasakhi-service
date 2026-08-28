import { createNotificationSchema } from './create-notification.dto';

describe('createNotificationSchema', () => {
  const baseInput = {
    recipientUserId: '22222222-2222-2222-2222-222222222222',
    notificationType: 'MISSED_VISIT_ESCALATION' as const,
    title: 'Missed visit',
    status: 'UNREAD' as const,
  };

  it('accepts a minimal payload', () => {
    const result = createNotificationSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it.each([
    'MISSED_VISIT_ESCALATION',
    'BENEFICIARY_TRANSFER_NOTICE',
    'LMP_CHANGE_UPDATE',
    'REOPEN_UPDATE',
    'REFERRAL_INCOMPLETE_UPDATE',
    'ACCOMPANIED_REFERRAL_UPDATE',
    'DATA_RESTORE_UPDATE',
    'CLOSURE_REVIEW_UPDATE',
  ])('accepts notificationType %s', (notificationType) => {
    const result = createNotificationSchema.safeParse({ ...baseInput, notificationType });
    expect(result.success).toBe(true);
  });

  it('rejects a notificationType outside the enum', () => {
    const result = createNotificationSchema.safeParse({
      ...baseInput,
      notificationType: 'NOT_A_REAL_TYPE',
    });
    expect(result.success).toBe(false);
  });

  it('accepts linkedEntityType/linkedEntityId when supplied', () => {
    const result = createNotificationSchema.safeParse({
      ...baseInput,
      linkedEntityType: 'ApprovalRequest',
      linkedEntityId: '33333333-3333-3333-3333-333333333333',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown field (.strict())', () => {
    const result = createNotificationSchema.safeParse({ ...baseInput, foo: 'bar' });
    expect(result.success).toBe(false);
  });
});
