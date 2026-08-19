import { badRequest, notFound, unprocessable } from '@armman/service-commons';
import type { MediaAssetRepository } from './mediaAsset.repository';
import type { CreateMediaAssetInput } from './dto/create-mediaAsset.dto';
import type { CreateUploadUrlInput } from './dto/create-upload-url.dto';
import {
  generateObjectKey,
  getPresignedUploadUrl,
  getPresignedViewUrl,
  headObject,
} from './s3.client';
import { appConfig } from '../config/app-config';
import { getUserDisplayName } from './auth.client';

/** Media asset domain logic. Data access is delegated to the repository. */
export class MediaAssetService {
  constructor(private readonly repository: MediaAssetRepository) {}

  list() {
    return this.repository.findMany();
  }

  /**
   * Confirms a media asset was actually finalized (a row exists, i.e.
   * `POST /media` previously succeeded) and returns a short-lived URL to view
   * the file itself, plus the uploader's display name — no id/mimeType/other
   * metadata, since the caller only wants to look at the image and know who
   * uploaded it, not inspect the full record. `uploadedByName` is `null` when
   * the asset has no recorded uploader, or when that user could no longer be
   * resolved (see `auth.client.ts`'s `getUserDisplayName`).
   */
  async getById(
    id: string,
    authorizationHeader: string,
  ): Promise<{ viewUrl: string; uploadedByName: string | null }> {
    const asset = await this.repository.findById(id);
    if (!asset) {
      throw notFound('Media asset not found.');
    }
    const { viewUrl } = await getPresignedViewUrl(asset.storageUri);
    const uploadedByName = asset.uploadedByUserId
      ? await getUserDisplayName(asset.uploadedByUserId, authorizationHeader)
      : null;
    return { viewUrl, uploadedByName };
  }

  /**
   * Issues a presigned S3 upload URL under a freshly generated key. This is
   * a pure S3/config operation — nothing is written to the database until
   * the client comes back to `create()` with proof the upload succeeded.
   */
  async createUploadUrl(dto: CreateUploadUrlInput) {
    const key = generateObjectKey(dto.assetType);
    const { uploadUrl, expiresInSeconds } = await getPresignedUploadUrl({
      key,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
    });
    return {
      uploadUrl,
      s3Key: key,
      expiresInSeconds,
      maxSizeBytes: appConfig.MAX_UPLOAD_SIZE_BYTES,
    };
  }

  /**
   * Confirms the client actually finished uploading to the key it was
   * issued, and reads back the real size/content-type/ETag from S3 itself
   * rather than trusting whatever the client claims here — a client could
   * otherwise register a media asset row pointing at an object that doesn't
   * exist. `expectedSizeBytes` (the same value originally declared to
   * `POST /media/upload-url`) is cross-checked against S3's actual
   * `ContentLength` so a stale/wrong object left at a reused key is caught,
   * not just "something exists at this key."
   */
  async create(dto: CreateMediaAssetInput) {
    // The key's own assetType segment (set by generateObjectKey at issue
    // time) must match what this call declares — catches a caller finalizing
    // a legitimately-issued key under a different assetType than it was
    // requested for, without needing to track which caller was issued which
    // key (PR #153 review: s3Key has no server-side caller binding today).
    const keyAssetTypeSegment = dto.s3Key.split('/').at(-2);
    if (keyAssetTypeSegment !== dto.assetType.toLowerCase()) {
      throw badRequest('s3Key was not issued for this assetType.');
    }

    const head = await headObject(dto.s3Key);
    if (!head.exists) {
      throw badRequest(
        'Upload not found for this key — did you finish uploading to the presigned URL before confirming?',
      );
    }
    if (head.sizeBytes !== dto.expectedSizeBytes) {
      throw unprocessable(
        `Uploaded object size (${head.sizeBytes} bytes) does not match the declared size (${dto.expectedSizeBytes} bytes) — the upload may be incomplete or the wrong file.`,
      );
    }
    // A multipart-upload ETag has a `-<partCount>` suffix and is not a pure
    // MD5 hex digest (it's a hash-of-hashes) — this endpoint only issues
    // presigned URLs for single-part `PutObject`, so this should never
    // happen from a client using this flow as intended, but it's cheap to
    // guard rather than store a `checksum` column that silently isn't one.
    if (head.etag === null || !/^[0-9a-f]{32}$/i.test(head.etag)) {
      throw unprocessable(
        'S3 did not return a usable ETag for the uploaded object (expected a single-part MD5 ETag).',
      );
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- excluded from the repository payload, already verified above
    const { s3Key, expectedSizeBytes, ...rest } = dto;
    return this.repository.create({
      ...rest,
      storageUri: `s3://${appConfig.S3_BUCKET_NAME}/${s3Key}`,
      checksum: Buffer.from(head.etag, 'hex'),
      mimeType: head.mimeType,
      sizeBytes: BigInt(head.sizeBytes),
      uploadedAt: new Date(),
    });
  }
}
