import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date-only string (YYYY-MM-DD)');

/**
 * Query params for `GET /beneficiaries/internal/post-edd-pending` — a
 * SYSTEM-only, server-to-server endpoint for visit-form-service's post-EDD
 * visit-generation job (EDD+7 delivery-form-pending detection, per the
 * build plan's "What we need from backend" list). No sakhiId/roster scoping
 * (unlike every human-facing list endpoint) since the only caller is a
 * background job acting system-wide, not a Sakhi/Supervisor/Manager viewing
 * their own scope.
 */
export const postEddPendingQuerySchema = z
  .object({
    // Candidates are MOTHER cases whose EDD is on or before this date —
    // the job passes `today - 7 days`.
    cutoffDate: dateOnlySchema,
    // Opaque, base64-encoded cursor — see beneficiary.repository.ts's
    // encode/decodePostEddCursor.
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(500).default(200),
  })
  .strict();

export type PostEddPendingQueryInput = z.infer<typeof postEddPendingQuerySchema>;
