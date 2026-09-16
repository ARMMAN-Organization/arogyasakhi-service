import { updateInventoryTransactionSchema } from './update-inventory-transaction.dto';

describe('updateInventoryTransactionSchema', () => {
  it('rejects a future transactionDate', () => {
    const result = updateInventoryTransactionSchema.safeParse({
      transactionDate: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid transactionDate', () => {
    const result = updateInventoryTransactionSchema.safeParse({
      transactionDate: new Date(),
    });
    expect(result.success).toBe(true);
  });

  it('accepts an update with no transactionDate at all', () => {
    const result = updateInventoryTransactionSchema.safeParse({ quantity: 5 });
    expect(result.success).toBe(true);
  });

  it('accepts a valid transactionType alone', () => {
    const result = updateInventoryTransactionSchema.safeParse({ transactionType: 'CONSUMED' });
    expect(result.success).toBe(true);
  });

  it('accepts transactionType combined with other fields', () => {
    const result = updateInventoryTransactionSchema.safeParse({
      transactionType: 'RETURNED',
      quantity: 2,
      remarks: 'corrected type',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid transactionType value', () => {
    const result = updateInventoryTransactionSchema.safeParse({ transactionType: 'BOGUS' });
    expect(result.success).toBe(false);
  });

  it('accepts an update with no transactionType at all (backward compatible)', () => {
    const result = updateInventoryTransactionSchema.safeParse({ quantity: 5 });
    expect(result.success).toBe(true);
  });

  it('rejects an empty object (at least one field must be provided)', () => {
    const result = updateInventoryTransactionSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
