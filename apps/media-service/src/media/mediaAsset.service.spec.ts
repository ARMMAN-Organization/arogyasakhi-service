jest.mock('../config/app-config', () => ({
  appConfig: {
    S3_BUCKET_NAME: 'test-bucket',
    MAX_UPLOAD_SIZE_BYTES: 26214400,
  },
}));

const mockGenerateObjectKey = jest.fn();
const mockGetPresignedUploadUrl = jest.fn();
const mockGetPresignedViewUrl = jest.fn();
const mockHeadObject = jest.fn();
jest.mock('./s3.client', () => ({
  generateObjectKey: (...args: unknown[]) => mockGenerateObjectKey(...args),
  getPresignedUploadUrl: (...args: unknown[]) => mockGetPresignedUploadUrl(...args),
  getPresignedViewUrl: (...args: unknown[]) => mockGetPresignedViewUrl(...args),
  headObject: (...args: unknown[]) => mockHeadObject(...args),
}));

const mockGetUserDisplayName = jest.fn();
jest.mock('./auth.client', () => ({
  getUserDisplayName: (...args: unknown[]) => mockGetUserDisplayName(...args),
}));

import { MediaAssetService } from './mediaAsset.service';
import type { MediaAssetRepository } from './mediaAsset.repository';
import type { BeneficiaryClient } from './beneficiary.client';
import type { CreateMediaAssetInput } from './dto/create-mediaAsset.dto';
import type { CreateUploadUrlInput } from './dto/create-upload-url.dto';
import type { MediaAsset } from '../../../../node_modules/.prisma/client-media-service';
import type { AuthenticatedUser } from '@armman/service-commons';

function caller(roles: string[]): AuthenticatedUser {
  return { id: 'user-1', roles, projectId: null, geographyUnitId: null };
}

describe('MediaAssetService', () => {
  const repository = {
    findMany: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<MediaAssetRepository>;
  const beneficiaryClient = {
    getById: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  let service: MediaAssetService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MediaAssetService(repository, beneficiaryClient);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  describe('getById', () => {
    const asset: MediaAsset = {
      id: 'asset-1',
      assetType: 'CONSENT_PHOTO',
      storageUri: 's3://test-bucket/media/consent_photo/abc-123',
      checksum: Buffer.from('d41d8cd98f00b204e9800998ecf8427e', 'hex'),
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

    it('returns uploadedByName: null and skips the name lookup when the asset has no recorded uploader (MANAGER fallback path since beneficiaryId is null)', async () => {
      repository.findById.mockResolvedValue(asset);
      mockGetPresignedViewUrl.mockResolvedValue({
        viewUrl: 'https://signed.example.com/view',
        expiresInSeconds: 3600,
      });

      const result = await service.getById('asset-1', caller(['MANAGER']), 'Bearer token-123');

      expect(repository.findById).toHaveBeenCalledWith('asset-1');
      expect(mockGetPresignedViewUrl).toHaveBeenCalledWith(asset.storageUri);
      expect(mockGetUserDisplayName).not.toHaveBeenCalled();
      expect(result).toEqual({ viewUrl: 'https://signed.example.com/view', uploadedByName: null });
    });

    it("resolves uploadedByName via auth.client, forwarding the caller's bearer token, when uploadedByUserId is set", async () => {
      repository.findById.mockResolvedValue({ ...asset, uploadedByUserId: 'user-1' });
      mockGetPresignedViewUrl.mockResolvedValue({
        viewUrl: 'https://signed.example.com/view',
        expiresInSeconds: 3600,
      });
      mockGetUserDisplayName.mockResolvedValue('Jane Sakhi');

      const result = await service.getById('asset-1', caller(['MANAGER']), 'Bearer token-123');

      expect(mockGetUserDisplayName).toHaveBeenCalledWith('user-1', 'Bearer token-123');
      expect(result).toEqual({
        viewUrl: 'https://signed.example.com/view',
        uploadedByName: 'Jane Sakhi',
      });
    });

    it('throws notFound (404) when no matching asset exists, without requesting a view URL or name', async () => {
      repository.findById.mockResolvedValue(null);

      await expect(
        service.getById('missing-id', caller(['MANAGER']), 'Bearer token-123'),
      ).rejects.toMatchObject({
        status: 404,
      });
      expect(mockGetPresignedViewUrl).not.toHaveBeenCalled();
      expect(mockGetUserDisplayName).not.toHaveBeenCalled();
    });

    describe('beneficiary/role scoping (PR #178 review finding #7)', () => {
      it('delegates scoping to beneficiary-service and returns 200 when the asset has a beneficiaryId and the caller is in scope', async () => {
        repository.findById.mockResolvedValue({ ...asset, beneficiaryId: 'beneficiary-1' });
        beneficiaryClient.getById.mockResolvedValue({ id: 'beneficiary-1', sakhiId: 'user-1' });
        mockGetPresignedViewUrl.mockResolvedValue({
          viewUrl: 'https://signed.example.com/view',
          expiresInSeconds: 3600,
        });

        const result = await service.getById('asset-1', caller(['SAKHI']), 'Bearer token-123');

        expect(beneficiaryClient.getById).toHaveBeenCalledWith('beneficiary-1', 'Bearer token-123');
        expect(result).toEqual({
          viewUrl: 'https://signed.example.com/view',
          uploadedByName: null,
        });
      });

      it('propagates the forbidden/403 thrown by beneficiary-service when the caller is out of scope for the beneficiary, without generating a view URL', async () => {
        repository.findById.mockResolvedValue({ ...asset, beneficiaryId: 'beneficiary-1' });
        beneficiaryClient.getById.mockRejectedValue(
          Object.assign(new Error('forbidden'), { status: 403 }),
        );

        await expect(
          service.getById('asset-1', caller(['SAKHI']), 'Bearer token-123'),
        ).rejects.toMatchObject({ status: 403 });
        expect(mockGetPresignedViewUrl).not.toHaveBeenCalled();
      });

      it('allows a MANAGER to view an asset with no beneficiaryId, without calling beneficiary-service', async () => {
        repository.findById.mockResolvedValue({ ...asset, beneficiaryId: null });
        mockGetPresignedViewUrl.mockResolvedValue({
          viewUrl: 'https://signed.example.com/view',
          expiresInSeconds: 3600,
        });

        const result = await service.getById('asset-1', caller(['MANAGER']), 'Bearer token-123');

        expect(beneficiaryClient.getById).not.toHaveBeenCalled();
        expect(result.viewUrl).toBe('https://signed.example.com/view');
      });

      it('allows an ADMIN to view an asset with no beneficiaryId, without calling beneficiary-service', async () => {
        repository.findById.mockResolvedValue({ ...asset, beneficiaryId: null });
        mockGetPresignedViewUrl.mockResolvedValue({
          viewUrl: 'https://signed.example.com/view',
          expiresInSeconds: 3600,
        });

        const result = await service.getById('asset-1', caller(['ADMIN']), 'Bearer token-123');

        expect(beneficiaryClient.getById).not.toHaveBeenCalled();
        expect(result.viewUrl).toBe('https://signed.example.com/view');
      });

      it.each(['SAKHI', 'SUPERVISOR'])(
        'throws forbidden (403) for a %s when the asset has no beneficiaryId, without generating a view URL',
        async (role) => {
          repository.findById.mockResolvedValue({ ...asset, beneficiaryId: null });

          await expect(
            service.getById('asset-1', caller([role]), 'Bearer token-123'),
          ).rejects.toMatchObject({ status: 403 });
          expect(beneficiaryClient.getById).not.toHaveBeenCalled();
          expect(mockGetPresignedViewUrl).not.toHaveBeenCalled();
        },
      );
    });
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
        uploadedAt: expect.any(Date),
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
