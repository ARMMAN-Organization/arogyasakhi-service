import { z } from 'zod';

/**
 * Validation schema for GET /approvals/by-source query params. Exactly one
 * of closureId/reopenRequestId must be given — this endpoint exists solely
 * for closure-reopen-service to resolve the approval_requests.id it needs
 * for Quick Response notification linking, not as a general lookup route.
 */
export const getApprovalBySourceSchema = z
  .object({
    closureId: z.string().uuid().optional(),
    reopenRequestId: z.string().uuid().optional(),
  })
  .strict()
  .refine((val) => Boolean(val.closureId) !== Boolean(val.reopenRequestId), {
    message: 'Provide exactly one of closureId or reopenRequestId.',
  });

export type GetApprovalBySourceInput = z.infer<typeof getApprovalBySourceSchema>;
