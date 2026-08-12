import { randomUUID } from 'node:crypto';
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { badGateway } from '@armman/service-commons';
import { appConfig } from '../config/app-config';

// Single shared client for the process lifetime — the SDK's HTTP agent/keep-alive
// pooling only pays off when reused across requests, and per-call construction
// would also re-resolve the default credential provider chain on every call.
const s3Client = new S3Client({ region: appConfig.AWS_REGION });

/**
 * Builds a presigned S3 `PutObject` URL the app uploads the file to directly,
 * bypassing this service for the (potentially large) file bytes themselves.
 *
 * Does NOT attempt to pin a SHA-256 checksum into the signature. Two earlier
 * approaches were tried and both failed against a real bucket: (1)
 * `ChecksumAlgorithm: 'SHA256'` requires the *uploader* to be a
 * checksum-aware AWS SDK — a plain PUT (curl, a bare mobile HTTP client)
 * never sends the resulting trailer, so `headObject` always found no
 * checksum and rejected a perfectly valid upload; (2) pinning
 * `ChecksumSHA256` to a caller-declared value and asking the client to send
 * a matching `x-amz-checksum-sha256` header failed with S3's "headers
 * present which were not signed" — `getSignedUrl` does not include
 * `x-amz-checksum-*` in `X-Amz-SignedHeaders` by default (a known,
 * unresolved gap in aws-sdk-js-v3 as of this writing, see
 * https://github.com/aws/aws-sdk-js-v3/issues/3906), so the header can
 * never actually be enforced this way. Integrity is verified in
 * `headObject` instead, via S3's own `ETag` (MD5 for a single-part PUT,
 * always present) plus a `ContentLength` match against what the client
 * declared upfront — weaker than a true end-to-end SHA-256, but it works
 * with any HTTP client and still catches a truncated or substituted upload.
 */
export async function getPresignedUploadUrl(input: {
  key: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<{ uploadUrl: string; expiresInSeconds: number }> {
  const command = new PutObjectCommand({
    Bucket: appConfig.S3_BUCKET_NAME,
    Key: input.key,
    ContentType: input.mimeType,
  });
  const uploadUrl = await getSignedUrl(s3Client, command, {
    expiresIn: appConfig.PRESIGNED_URL_EXPIRY_SECONDS,
  });
  return { uploadUrl, expiresInSeconds: appConfig.PRESIGNED_URL_EXPIRY_SECONDS };
}

/**
 * Produces a unique object key namespaced by asset type so the bucket stays
 * browsable/queryable by category. No file extension is appended — S3 does
 * not require one, and the authoritative content type already lives in the
 * `mime_type` DB column rather than being inferred from the key.
 */
export function generateObjectKey(assetType: string): string {
  return `${assetType.toLowerCase()}/${randomUUID()}`;
}

type HeadObjectResult =
  { exists: true; sizeBytes: number; mimeType: string; etag: string | null } | { exists: false };

/**
 * Confirms an upload actually landed in S3 and reads back the *real*
 * size/content-type/ETag, rather than trusting whatever the client later
 * claims in `POST /media`. `ETag` is S3's own content hash for a
 * single-part `PutObject` (an MD5 of the object body, quoted) — always
 * present, unlike a SHA-256 checksum, which requires upload-time cooperation
 * this endpoint cannot reliably compel from an arbitrary HTTP client (see
 * `getPresignedUploadUrl`'s doc comment). A missing object (not yet
 * uploaded, or the client never finished the PUT) is an expected outcome
 * the caller decides how to handle — it is not surfaced as an error here.
 * Any other failure (network, permissions, S3 outage) means we cannot
 * verify the upload at all, which is this service's own upstream dependency
 * failing.
 */
export async function headObject(key: string): Promise<HeadObjectResult> {
  try {
    const result = await s3Client.send(
      new HeadObjectCommand({ Bucket: appConfig.S3_BUCKET_NAME, Key: key }),
    );
    return {
      exists: true,
      sizeBytes: result.ContentLength ?? 0,
      mimeType: result.ContentType ?? '',
      etag: result.ETag ? result.ETag.replace(/^"|"$/g, '') : null,
    };
  } catch (error: unknown) {
    if (isNotFoundError(error)) {
      return { exists: false };
    }
    throw badGateway('S3 is unavailable — could not verify the upload.');
  }
}

/**
 * The AWS SDK v3 throws a `NotFound` error (name `NotFound`, `$metadata.httpStatusCode`
 * 404) for a `HeadObjectCommand` on a missing key. Checking both the error name and
 * the HTTP status guards against SDK version differences in exactly which shape is
 * thrown for "no such object" versus other 4xx/5xx S3 failures.
 */
function isNotFoundError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const name = 'name' in error ? String((error as { name: unknown }).name) : undefined;
  const httpStatusCode =
    '$metadata' in error &&
    typeof (error as { $metadata?: { httpStatusCode?: number } }).$metadata === 'object'
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
  return name === 'NotFound' || name === 'NoSuchKey' || httpStatusCode === 404;
}
