import { createInventoryTransactionSchema } from './create-inventory-transaction.dto';

describe('createInventoryTransactionSchema', () => {
  const baseInput = {
    projectId: '22222222-2222-2222-2222-222222222222',
    sakhiId: '44444444-4444-4444-4444-444444444444',
    transactionType: 'HANDOVER' as const,
    items: [{ itemId: '55555555-5555-5555-5555-555555555555', quantity: 1 }],
  };

  it('rejects a future transactionDate', () => {
    const result = createInventoryTransactionSchema.safeParse({
      ...baseInput,
      transactionDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].path).toEqual(['transactionDate']);
    }
  });

  it('accepts today as transactionDate', () => {
    const result = createInventoryTransactionSchema.safeParse({
      ...baseInput,
      transactionDate: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('accepts a past transactionDate', () => {
    const result = createInventoryTransactionSchema.safeParse({
      ...baseInput,
      transactionDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
    });
    expect(result.success).toBe(true);
  });
});
