import { z } from 'zod';

/**
 * Mirrors the `MediaAssetType` enum in the Prisma schema. Exported so
 * `create-upload-url.dto.ts` shares this one source of truth instead of
 * duplicating the literal list.
 */
export const mediaAssetTypeSchema = z.enum([
  'CONSENT_PHOTO',
  'REFERRAL_CASE_PAPER',
  'REFERRAL_DISCHARGE_SUMMARY',
  'REFERRAL_HEALTH_FACILITY_PHOTO',
  'REFERRAL_SAKHI_BENEFICIARY_PHOTO',
  'REFERRAL_INVESTIGATION_REPORT',
  'TRAINING_PHOTO',
  'HEALTH_EDUCATION',
  'FAQ',
  'REPORT_EXPORT',
  'OTHER',
]);

/**
 * Validation schema for creating a media asset. `.strict()` rejects unknown
 * fields, matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 *
 * Notably absent: `storageUri`, `checksum`, `mimeType`. Those all used to be
 * client-supplied, but a client can lie about what it uploaded — the service
 * now derives them itself from S3's `HeadObject` response for the `s3Key`
 * the client hands back (see `mediaAsset.service.ts`).
 *
 * `expectedSizeBytes` IS still client-supplied — it's the same value
 * originally declared to `POST /media/upload-url` (see
 * `create-upload-url.dto.ts`) — precisely so `create()` has something
 * independent to cross-check S3's reported `ContentLength` against. Trusting
 * S3's own `ContentLength` alone only proves "the object that's there now
 * has this size," not "the object that's there is the one the client meant
 * to upload" (e.g. a stale/wrong object left at a reused or guessed key).
 */
export const createMediaAssetSchema = z
  .object({
    assetType: mediaAssetTypeSchema,
    s3Key: z.string().trim().min(1),
    expectedSizeBytes: z.coerce.number().int().positive(),
    uploadedByUserId: z.string().uuid().optional(),
    uploadedAt: z.coerce.date(),
    linkedEntityType: z.string().trim().min(1).max(80).optional(),
    linkedEntityId: z.string().uuid().optional(),
    encryptedFlag: z.boolean().default(true),
    beneficiaryId: z.string().uuid().optional(),
    visitId: z.string().uuid().optional(),
    submissionId: z.string().uuid().optional(),
    referralId: z.string().uuid().optional(),
    followupId: z.string().uuid().optional(),
    eventId: z.string().uuid().optional(),
  })
  .strict();

export type CreateMediaAssetInput = z.infer<typeof createMediaAssetSchema>;
