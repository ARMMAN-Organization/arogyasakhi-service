import { z } from 'zod';

/** Mirrors the `SyncDirection` enum in the Prisma schema. */
const syncDirectionSchema = z.enum(['UPLOAD', 'DOWNLOAD']);

/** Mirrors the `SyncBatchStatus` enum in the Prisma schema. */
const syncBatchStatusSchema = z.enum(['STARTED', 'COMPLETED', 'FAILED', 'PARTIAL', 'CANCELLED']);

/** Mirrors the `SyncNetworkType` enum in the Prisma schema. */
const syncNetworkTypeSchema = z.enum(['WIFI', 'MOBILE', 'OFFLINE', 'UNKNOWN']);

/**
 * Validation schema for creating a sync batch. `.strict()` rejects unknown
 * fields, matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createSyncBatchSchema = z
  .object({
    deviceId: z.string().uuid(),
    userId: z.string().uuid(),
    direction: syncDirectionSchema,
    startedAt: z.coerce.date(),
    completedAt: z.coerce.date().optional(),
    status: syncBatchStatusSchema,
    appVersion: z.string().trim().min(1).max(40).optional(),
    networkType: syncNetworkTypeSchema.optional(),
  })
  .strict();

export type CreateSyncBatchInput = z.infer<typeof createSyncBatchSchema>;
