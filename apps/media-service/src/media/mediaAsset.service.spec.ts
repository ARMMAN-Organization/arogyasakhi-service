jest.mock('../config/app-config', () => ({
  appConfig: {
    S3_BUCKET_NAME: 'test-bucket',
    MAX_UPLOAD_SIZE_BYTES: 26214400,
  },
}));

const mockGenerateObjectKey = jest.fn();
const mockGetPresignedUploadUrl = jest.fn();
const mockHeadObject = jest.fn();
jest.mock('./s3.client', () => ({
  generateObjectKey: (...args: unknown[]) => mockGenerateObjectKey(...args),
  getPresignedUploadUrl: (...args: unknown[]) => mockGetPresignedUploadUrl(...args),
  headObject: (...args: unknown[]) => mockHeadObject(...args),
}));

import { MediaAssetService } from './mediaAsset.service';
import type { MediaAssetRepository } from './mediaAsset.repository';
import type { CreateMediaAssetInput } from './dto/create-mediaAsset.dto';
import type { CreateUploadUrlInput } from './dto/create-upload-url.dto';
import type { MediaAsset } from '../../../../node_modules/.prisma/client-media-service';

describe('MediaAssetService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<MediaAssetRepository>;
  let service: MediaAssetService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MediaAssetService(repository);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  describe('createUploadUrl', () => {
    it('generates a key, requests a presigned URL, and does not touch the repository', async () => {
      const dto: CreateUploadUrlInput = {
        assetType: 'CONSENT_PHOTO',
        mimeType: 'image/jpeg',
        sizeBytes: 204800,
      };
      mockGenerateObjectKey.mockReturnValue('media/consent_photo/abc-123');
      mockGetPresignedUploadUrl.mockResolvedValue({
        uploadUrl: 'https://signed.example.com/upload',
        expiresInSeconds: 900,
      });

      const result = await service.createUploadUrl(dto);

      expect(mockGenerateObjectKey).toHaveBeenCalledWith('CONSENT_PHOTO');
      expect(mockGetPresignedUploadUrl).toHaveBeenCalledWith({
        key: 'media/consent_photo/abc-123',
        mimeType: 'image/jpeg',
        sizeBytes: 204800,
      });
      expect(result).toEqual({
        uploadUrl: 'https://signed.example.com/upload',
        s3Key: 'media/consent_photo/abc-123',
        expiresInSeconds: 900,
        maxSizeBytes: 26214400,
      });
      expect(repository.create).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    const dto: CreateMediaAssetInput = {
      assetType: 'CONSENT_PHOTO',
      s3Key: 'media/consent_photo/abc-123',
      expectedSizeBytes: 204800,
      uploadedAt: new Date('2026-07-31T00:00:00Z'),
      encryptedFlag: true,
    };
    const validEtag = 'd41d8cd98f00b204e9800998ecf8427e';

    const created: MediaAsset = {
      id: '1',
      assetType: 'CONSENT_PHOTO',
      storageUri: 's3://test-bucket/media/consent_photo/abc-123',
      checksum: Buffer.from(validEtag, 'hex'),
      mimeType: 'image/jpeg',
      sizeBytes: 204800n,
      uploadedByUserId: null,
      uploadedAt: new Date('2026-07-31T00:00:00Z'),
      linkedEntityType: null,
      linkedEntityId: null,
      encryptedFlag: true,
      beneficiaryId: null,
      visitId: null,
      submissionId: null,
      referralId: null,
      followupId: null,
      eventId: null,
      createdAt: new Date(),
      createdByUserId: null,
      updatedAt: new Date(),
      updatedByUserId: null,
      isDeleted: false,
      deletedAt: null,
    };

    it('verifies the S3 object and builds the create payload from HeadObject data on the happy path', async () => {
      mockHeadObject.mockResolvedValue({
        exists: true,
        sizeBytes: 204800,
        mimeType: 'image/jpeg',
        etag: validEtag,
      });
      repository.create.mockResolvedValue(created);

      const result = await service.create(dto);

      expect(mockHeadObject).toHaveBeenCalledWith('media/consent_photo/abc-123');
      expect(repository.create).toHaveBeenCalledWith({
        assetType: 'CONSENT_PHOTO',
        uploadedAt: dto.uploadedAt,
        encryptedFlag: true,
        storageUri: 's3://test-bucket/media/consent_photo/abc-123',
        checksum: Buffer.from(validEtag, 'hex'),
        mimeType: 'image/jpeg',
        sizeBytes: 204800n,
      });
      expect(result).toBe(created);
    });

    it('throws badRequest (400) when the S3 object does not exist', async () => {
      mockHeadObject.mockResolvedValue({ exists: false });

      await expect(service.create(dto)).rejects.toMatchObject({ status: 400 });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('throws badRequest (400) when the s3Key was not issued for the declared assetType, without calling headObject', async () => {
      const mismatched = { ...dto, s3Key: 'media/other/abc-123' };

      await expect(service.create(mismatched)).rejects.toMatchObject({ status: 400 });
      expect(mockHeadObject).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('throws unprocessable (422) when the uploaded size does not match the declared size', async () => {
      mockHeadObject.mockResolvedValue({
        exists: true,
        sizeBytes: 100,
        mimeType: 'image/jpeg',
        etag: validEtag,
      });

      await expect(service.create(dto)).rejects.toMatchObject({ status: 422 });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('throws unprocessable (422) when the ETag is missing', async () => {
      mockHeadObject.mockResolvedValue({
        exists: true,
        sizeBytes: 204800,
        mimeType: 'image/jpeg',
        etag: null,
      });

      await expect(service.create(dto)).rejects.toMatchObject({ status: 422 });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('throws unprocessable (422) when the ETag is a multipart-upload ETag (not a pure MD5 hex digest)', async () => {
      mockHeadObject.mockResolvedValue({
        exists: true,
        sizeBytes: 204800,
        mimeType: 'image/jpeg',
        etag: `${validEtag}-2`,
      });

      await expect(service.create(dto)).rejects.toMatchObject({ status: 422 });
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('propagates errors from headObject (e.g. the badGateway thrown for S3 outages)', async () => {
      const badGatewayError = Object.assign(new Error('S3 is unavailable'), { status: 502 });
      mockHeadObject.mockRejectedValue(badGatewayError);

      await expect(service.create(dto)).rejects.toMatchObject({ status: 502 });
      expect(repository.create).not.toHaveBeenCalled();
    });
  });
});
