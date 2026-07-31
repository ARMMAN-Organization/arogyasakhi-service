import { createMediaAssetSchema } from './create-mediaAsset.dto';

describe('createMediaAssetSchema — checksum', () => {
  const validHexChecksum = 'a'.repeat(64);
  const basePayload = {
    assetType: 'OTHER' as const,
    storageUri: 's3://arogya-media/test.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 204800,
    uploadedAt: '2026-07-31T00:00:00Z',
  };

  it('accepts a valid 64-char lowercase hex string and transforms it to a Buffer', () => {
    const result = createMediaAssetSchema.safeParse({
      ...basePayload,
      checksum: validHexChecksum,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.checksum).toBeInstanceOf(Buffer);
      expect(result.data.checksum).toEqual(Buffer.from(validHexChecksum, 'hex'));
    }
  });

  it('accepts a valid 64-char uppercase/mixed-case hex string', () => {
    const mixedCase = 'A1b2'.repeat(16);
    const result = createMediaAssetSchema.safeParse({ ...basePayload, checksum: mixedCase });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.checksum).toEqual(Buffer.from(mixedCase, 'hex'));
    }
  });

  it('rejects a string shorter than 64 hex chars', () => {
    const result = createMediaAssetSchema.safeParse({
      ...basePayload,
      checksum: 'a'.repeat(63),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a string longer than 64 hex chars', () => {
    const result = createMediaAssetSchema.safeParse({
      ...basePayload,
      checksum: 'a'.repeat(65),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a string with non-hex characters', () => {
    const result = createMediaAssetSchema.safeParse({
      ...basePayload,
      checksum: 'g'.repeat(64),
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty string', () => {
    const result = createMediaAssetSchema.safeParse({ ...basePayload, checksum: '' });
    expect(result.success).toBe(false);
  });

  it('rejects a Buffer instance passed directly (real HTTP JSON can never produce one)', () => {
    const result = createMediaAssetSchema.safeParse({
      ...basePayload,
      checksum: Buffer.from(validHexChecksum, 'hex'),
    });
    expect(result.success).toBe(false);
  });

  it('parses a full valid payload end-to-end', () => {
    const result = createMediaAssetSchema.safeParse({
      ...basePayload,
      checksum: validHexChecksum,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.assetType).toBe('OTHER');
      expect(result.data.storageUri).toBe(basePayload.storageUri);
      expect(result.data.checksum).toBeInstanceOf(Buffer);
      expect(result.data.sizeBytes).toBe(204800n);
    }
  });
});
