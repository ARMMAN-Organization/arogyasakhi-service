import { z } from 'zod';

/**
 * Query for `GET /visits` — list/sync-pull, role-scoped exactly like
 * getVisitSummary (visitInstance.service.ts): SAKHI is forced to her own
 * sakhiId regardless of what's passed here; SUPERVISOR narrows to one
 * roster member or defaults to her full roster; MANAGER/ADMIN unscoped
 * unless sakhiId is explicitly given.
 *
 * `.strict()`, not `.refine()`-wrapped — same OpenAPI-introspection
 * constraint as every other query schema in this codebase.
 */
export const listVisitInstancesQuerySchema = z
  .object({
    beneficiaryId: z.string().uuid().optional(),
    sakhiId: z.string().uuid().optional(),
    statusLookupValueId: z.string().uuid().optional(),
    // Delta-sync filter — only rows updated after this instant.
    updatedAfter: z.string().datetime().optional(),
    // Opaque, base64url-encoded cursor — see visitInstance.repository.ts's
    // encode/decodeCursor.
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListVisitInstancesQuery = z.infer<typeof listVisitInstancesQuerySchema>;
