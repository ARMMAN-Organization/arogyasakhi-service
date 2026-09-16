import { appendInventoryTransactionItemSchema } from './append-inventory-transaction-item.dto';

describe('appendInventoryTransactionItemSchema', () => {
  const baseInput = {
    itemId: '55555555-5555-5555-5555-555555555555',
    quantity: 1,
  };

  it('accepts a minimal valid body', () => {
    const result = appendInventoryTransactionItemSchema.safeParse(baseInput);
    expect(result.success).toBe(true);
  });

  it('accepts an optional remarks string', () => {
    const result = appendInventoryTransactionItemSchema.safeParse({
      ...baseInput,
      remarks: 'extra unit found',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing itemId', () => {
    const result = appendInventoryTransactionItemSchema.safeParse({ quantity: 1 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-uuid itemId', () => {
    const result = appendInventoryTransactionItemSchema.safeParse({
      ...baseInput,
      itemId: 'not-a-uuid',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a zero quantity', () => {
    const result = appendInventoryTransactionItemSchema.safeParse({ ...baseInput, quantity: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative quantity', () => {
    const result = appendInventoryTransactionItemSchema.safeParse({ ...baseInput, quantity: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer quantity', () => {
    const result = appendInventoryTransactionItemSchema.safeParse({ ...baseInput, quantity: 1.5 });
    expect(result.success).toBe(false);
  });

  it('rejects an attempt to re-specify transactionType (header fields are inherited, not client-supplied)', () => {
    const result = appendInventoryTransactionItemSchema.safeParse({
      ...baseInput,
      transactionType: 'RETURNED',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an attempt to re-specify transactionDate', () => {
    const result = appendInventoryTransactionItemSchema.safeParse({
      ...baseInput,
      transactionDate: new Date().toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an attempt to re-specify sakhiId/projectId', () => {
    const result = appendInventoryTransactionItemSchema.safeParse({
      ...baseInput,
      sakhiId: '44444444-4444-4444-4444-444444444444',
      projectId: '22222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown extra field', () => {
    const result = appendInventoryTransactionItemSchema.safeParse({
      ...baseInput,
      extra: 'nope',
    });
    expect(result.success).toBe(false);
  });
});
