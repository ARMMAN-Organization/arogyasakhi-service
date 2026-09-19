import { createSyncItemsSchema } from './create-syncItem.dto';

function baseItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    syncBatchId: '11111111-1111-1111-1111-111111111111',
    localEntityUuid: 'local-uuid-1',
    entityType: 'BENEFICIARY',
    operation: 'CREATE',
    status: 'SUCCESS',
    ...overrides,
  };
}

describe('createSyncItemsSchema', () => {
  it('accepts a single-item body', () => {
    const result = createSyncItemsSchema.safeParse({ items: [baseItem()] });
    expect(result.success).toBe(true);
  });

  it('accepts a bulk array of items', () => {
    const result = createSyncItemsSchema.safeParse({
      items: [baseItem(), baseItem({ localEntityUuid: 'local-uuid-2' })],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty items array', () => {
    const result = createSyncItemsSchema.safeParse({ items: [] });
    expect(result.success).toBe(false);
  });

  it('rejects a missing syncBatchId', () => {
    const { syncBatchId: _omit, ...rest } = baseItem();
    const result = createSyncItemsSchema.safeParse({ items: [rest] });
    expect(result.success).toBe(false);
  });

  it('rejects a missing localEntityUuid', () => {
    const { localEntityUuid: _omit, ...rest } = baseItem();
    const result = createSyncItemsSchema.safeParse({ items: [rest] });
    expect(result.success).toBe(false);
  });

  it('rejects a missing entityType', () => {
    const { entityType: _omit, ...rest } = baseItem();
    const result = createSyncItemsSchema.safeParse({ items: [rest] });
    expect(result.success).toBe(false);
  });

  it('rejects a missing operation', () => {
    const { operation: _omit, ...rest } = baseItem();
    const result = createSyncItemsSchema.safeParse({ items: [rest] });
    expect(result.success).toBe(false);
  });

  it('rejects a missing status', () => {
    const { status: _omit, ...rest } = baseItem();
    const result = createSyncItemsSchema.safeParse({ items: [rest] });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown status value', () => {
    const result = createSyncItemsSchema.safeParse({
      items: [baseItem({ status: 'NOT_A_STATUS' })],
    });
    expect(result.success).toBe(false);
  });

  it('rejects DUPLICATE as a caller-supplied status — computed server-side only', () => {
    const result = createSyncItemsSchema.safeParse({
      items: [baseItem({ status: 'DUPLICATE' })],
    });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown top-level extra field', () => {
    const result = createSyncItemsSchema.safeParse({ items: [baseItem()], extra: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects an unknown extra field on an item', () => {
    const result = createSyncItemsSchema.safeParse({
      items: [baseItem({ extra: 'x' })],
    });
    expect(result.success).toBe(false);
  });
});
