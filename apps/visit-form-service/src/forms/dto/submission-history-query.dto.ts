import { z } from 'zod';

/**
 * Query params for `GET /beneficiaries/:beneficiaryId/submissions` — cursor
 * pagination, matching beneficiary.repository.ts's encode/decodeCursor
 * convention (opaque, base64url-encoded, returned as `nextCursor` in the
 * response and passed back unchanged for the next page).
 */
export const submissionHistoryQuerySchema = z
  .object({
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type SubmissionHistoryQueryInput = z.infer<typeof submissionHistoryQuerySchema>;
