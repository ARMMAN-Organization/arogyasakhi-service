import { z } from 'zod';

/** Mirrors the `MediaAssetType` enum in the Prisma schema. */
const mediaAssetTypeSchema = z.enum([
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
 * SHA-256 checksum, sent as a 64-char hex string (the only representation a
 * JSON request body can carry) and converted to the `Buffer` the `Bytes`
 * Prisma column expects. `z.instanceof(Buffer)` was used here previously,
 * but `express.json()` never produces a `Buffer` from a JSON field — that
 * made this endpoint unreachable over real HTTP with any client.
 */
const checksumSchema = z
  .string()
  .trim()
  .regex(/^[0-9a-f]{64}$/i, 'must be a 64-character hex-encoded SHA-256 checksum')
  .transform((hex) => Buffer.from(hex, 'hex'));

/**
 * Validation schema for creating a media asset. `.strict()` rejects unknown
 * fields, matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createMediaAssetSchema = z
  .object({
    assetType: mediaAssetTypeSchema,
    storageUri: z.string().trim().min(1).max(512),
    checksum: checksumSchema,
    mimeType: z.string().trim().min(1).max(120),
    sizeBytes: z.coerce.bigint(),
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
