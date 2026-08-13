import { createMediaAssetSchema } from './create-mediaAsset.dto';

describe('createMediaAssetSchema', () => {
  const basePayload = {
    assetType: 'OTHER' as const,
    s3Key: 'media/other/8f14e45f-ceea-467e-bd97-13a3f4d7747e',
    expectedSizeBytes: 204800,
    uploadedAt: '2026-07-31T00:00:00Z',
  };

  it('accepts a valid payload with only the required fields', () => {
    const result = createMediaAssetSchema.safeParse(basePayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assetType).toBe('OTHER');
      expect(result.data.s3Key).toBe(basePayload.s3Key);
    }
  });

  it('rejects a missing s3Key', () => {
    const rest: Record<string, unknown> = { ...basePayload };
    delete rest.s3Key;
    const result = createMediaAssetSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects an empty s3Key', () => {
    const result = createMediaAssetSchema.safeParse({ ...basePayload, s3Key: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an s3Key not shaped like one generateObjectKey would produce', () => {
    const result = createMediaAssetSchema.safeParse({
      ...basePayload,
      s3Key: '../../etc/passwd',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an s3Key missing the trailing UUID segment', () => {
    const result = createMediaAssetSchema.safeParse({ ...basePayload, s3Key: 'media/other' });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid assetType', () => {
    const result = createMediaAssetSchema.safeParse({ ...basePayload, assetType: 'NOT_A_TYPE' });
    expect(result.success).toBe(false);
  });

  it('rejects legacy client-supplied storageUri/checksum/mimeType as unknown fields', () => {
    const result = createMediaAssetSchema.safeParse({
      ...basePayload,
      storageUri: 's3://bucket/key',
      checksum: 'a'.repeat(64),
      mimeType: 'image/jpeg',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a missing expectedSizeBytes', () => {
    const rest: Record<string, unknown> = { ...basePayload };
    delete rest.expectedSizeBytes;
    const result = createMediaAssetSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive expectedSizeBytes', () => {
    const result = createMediaAssetSchema.safeParse({ ...basePayload, expectedSizeBytes: 0 });
    expect(result.success).toBe(false);
  });

  it('accepts optional linkage and metadata fields', () => {
    const result = createMediaAssetSchema.safeParse({
      ...basePayload,
      uploadedByUserId: 'a1111111-1111-1111-1111-111111111111',
      linkedEntityType: 'BENEFICIARY',
      linkedEntityId: 'b2222222-2222-2222-2222-222222222222',
      encryptedFlag: false,
      beneficiaryId: 'b2222222-2222-2222-2222-222222222222',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.encryptedFlag).toBe(false);
    }
  });

  it('defaults encryptedFlag to true when omitted', () => {
    const result = createMediaAssetSchema.safeParse(basePayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.encryptedFlag).toBe(true);
    }
  });

  it('rejects unknown extra fields', () => {
    const result = createMediaAssetSchema.safeParse({ ...basePayload, extra: 'nope' });
    expect(result.success).toBe(false);
  });
});
