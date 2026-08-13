import { z } from 'zod';
import { appConfig } from '../../config/app-config';
import { mediaAssetTypeSchema } from './create-mediaAsset.dto';

/**
 * Validation schema for requesting a presigned S3 upload URL. `.strict()`
 * rejects unknown fields, matching this repo's convention for request DTOs.
 * `mimeType`/`sizeBytes` are validated against operator-configured limits
 * (env-driven, not hardcoded) so they can be tightened/loosened per
 * environment without a code change. `sizeBytes` is also the value
 * `mediaAsset.service.ts` later checks the actual uploaded object's
 * `ContentLength` against on finalize — see that file's `create()` for why
 * a client-declared SHA-256 checksum is not requested here (S3 presigned
 * URLs cannot reliably enforce one against an arbitrary HTTP client).
 */
export const createUploadUrlSchema = z
  .object({
    assetType: mediaAssetTypeSchema,
    mimeType: z
      .string()
      .trim()
      .min(1)
      .max(120)
      .refine(
        (v) => appConfig.ALLOWED_UPLOAD_MIME_TYPES.includes(v),
        (v) => ({
          message: `mimeType '${v}' is not allowed. Must be one of: ${appConfig.ALLOWED_UPLOAD_MIME_TYPES.join(', ')}`,
        }),
      ),
    sizeBytes: z.coerce
      .number()
      .int()
      .positive()
      .max(
        appConfig.MAX_UPLOAD_SIZE_BYTES,
        `sizeBytes must not exceed ${appConfig.MAX_UPLOAD_SIZE_BYTES} bytes`,
      ),
  })
  .strict();

export type CreateUploadUrlInput = z.infer<typeof createUploadUrlSchema>;
