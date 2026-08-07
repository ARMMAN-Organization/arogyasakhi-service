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
});
