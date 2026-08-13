// app-config reads process.env at import time and fails fast if required
// vars (e.g. S3_BUCKET_NAME) are missing — mock it so this spec doesn't
// depend on a real .env being present, matching how s3.client.spec.ts and
// mediaAsset.service.spec.ts isolate the same dependency.
jest.mock('../../config/app-config', () => ({
  appConfig: {
    ALLOWED_UPLOAD_MIME_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
    MAX_UPLOAD_SIZE_BYTES: 26214400,
  },
}));

import { createUploadUrlSchema } from './create-upload-url.dto';

describe('createUploadUrlSchema', () => {
  const validPayload = {
    assetType: 'CONSENT_PHOTO' as const,
    mimeType: 'image/jpeg',
    sizeBytes: 204800,
  };

  it('accepts a valid payload', () => {
    const result = createUploadUrlSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toEqual(validPayload);
    }
  });

  it('rejects a disallowed mimeType', () => {
    const result = createUploadUrlSchema.safeParse({
      ...validPayload,
      mimeType: 'application/x-msdownload',
    });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes exceeding MAX_UPLOAD_SIZE_BYTES', () => {
    const result = createUploadUrlSchema.safeParse({ ...validPayload, sizeBytes: 26214401 });
    expect(result.success).toBe(false);
  });

  it('rejects sizeBytes of zero', () => {
    const result = createUploadUrlSchema.safeParse({ ...validPayload, sizeBytes: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative sizeBytes', () => {
    const result = createUploadUrlSchema.safeParse({ ...validPayload, sizeBytes: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid assetType', () => {
    const result = createUploadUrlSchema.safeParse({ ...validPayload, assetType: 'NOT_A_TYPE' });
    expect(result.success).toBe(false);
  });

  it('rejects unknown extra fields', () => {
    const result = createUploadUrlSchema.safeParse({ ...validPayload, extra: 'nope' });
    expect(result.success).toBe(false);
  });

  it.each(['assetType', 'mimeType', 'sizeBytes'])(
    'rejects a missing required field: %s',
    (field) => {
      const payload = { ...validPayload };
      delete (payload as Record<string, unknown>)[field];
      const result = createUploadUrlSchema.safeParse(payload);
      expect(result.success).toBe(false);
    },
  );
});
