jest.mock('../config/app-config', () => ({
  appConfig: {
    S3_BUCKET_NAME: 'test-bucket',
    AWS_REGION: 'ap-south-1',
    PRESIGNED_URL_EXPIRY_SECONDS: 900,
  },
}));

const mockSend = jest.fn();
jest.mock('@aws-sdk/client-s3', () => {
  class NotFound extends Error {
    name = 'NotFound';
  }
  return {
    S3Client: jest.fn().mockImplementation(() => ({ send: mockSend })),
    PutObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    HeadObjectCommand: jest.fn().mockImplementation((input) => ({ input })),
    NotFound,
  };
});

const mockGetSignedUrl = jest.fn();
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

import { PutObjectCommand } from '@aws-sdk/client-s3';
import { generateObjectKey, getPresignedUploadUrl, headObject } from './s3.client';

describe('s3.client', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getPresignedUploadUrl', () => {
    it('builds a PutObjectCommand with bucket, key, and content type, and signs with the configured expiry', async () => {
      mockGetSignedUrl.mockResolvedValue('https://signed.example.com/upload');

      const result = await getPresignedUploadUrl({
        key: 'consent_photo/abc-123',
        mimeType: 'image/jpeg',
        sizeBytes: 204800,
      });

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: 'test-bucket',
        Key: 'consent_photo/abc-123',
        ContentType: 'image/jpeg',
      });
      expect(mockGetSignedUrl).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ expiresIn: 900 }),
      );
      expect(result).toEqual({
        uploadUrl: 'https://signed.example.com/upload',
        expiresInSeconds: 900,
      });
    });
  });

  describe('generateObjectKey', () => {
    it('returns a key prefixed by the lowercased asset type containing a UUID', () => {
      const key = generateObjectKey('CONSENT_PHOTO');
      expect(key).toMatch(
        /^consent_photo\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    });

    it('returns a unique key across calls', () => {
      const a = generateObjectKey('OTHER');
      const b = generateObjectKey('OTHER');
      expect(a).not.toEqual(b);
    });
  });

  describe('headObject', () => {
    it('returns exists:true with fields derived from the S3 response, stripping ETag quotes', async () => {
      mockSend.mockResolvedValue({
        ContentLength: 204800,
        ContentType: 'image/jpeg',
        ETag: '"d41d8cd98f00b204e9800998ecf8427e"',
      });

      const result = await headObject('consent_photo/abc-123');

      expect(result).toEqual({
        exists: true,
        sizeBytes: 204800,
        mimeType: 'image/jpeg',
        etag: 'd41d8cd98f00b204e9800998ecf8427e',
      });
    });

    it('returns etag:null when S3 provides no ETag', async () => {
      mockSend.mockResolvedValue({ ContentLength: 204800, ContentType: 'image/jpeg' });

      const result = await headObject('consent_photo/abc-123');

      expect(result).toEqual({
        exists: true,
        sizeBytes: 204800,
        mimeType: 'image/jpeg',
        etag: null,
      });
    });

    it('returns exists:false on a NotFound S3 error', async () => {
      const error = new Error('not found');
      error.name = 'NotFound';
      mockSend.mockRejectedValue(error);

      const result = await headObject('missing/key');

      expect(result).toEqual({ exists: false });
    });

    it('returns exists:false on a 404-shaped error without the NotFound name', async () => {
      mockSend.mockRejectedValue({ $metadata: { httpStatusCode: 404 } });

      const result = await headObject('missing/key');

      expect(result).toEqual({ exists: false });
    });

    it('throws badGateway on any other S3/network error', async () => {
      mockSend.mockRejectedValue(new Error('ECONNRESET'));

      await expect(headObject('some/key')).rejects.toMatchObject({
        status: 502,
        message: expect.stringContaining('S3 is unavailable'),
      });
    });
  });
});
