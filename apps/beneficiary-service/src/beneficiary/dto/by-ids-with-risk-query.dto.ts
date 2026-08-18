import { z } from 'zod';

/**
 * Query params for `GET /beneficiaries/by-ids-with-risk`. `ids` is a
 * comma-separated list of beneficiary ids (the caller has already scoped
 * this list, e.g. to one pada's beneficiaries) — kept as a plain string
 * here (not `.transform()`ed) because `createDocumentedRouter()` cannot
 * introspect a ZodEffects as an OpenAPI parameter object; the split into an
 * array happens in the controller, same as list-beneficiaries.dto.ts's
 * registeredFrom/registeredTo alias normalization. `search` narrows to an
 * exact name-hash match (names are encrypted, no partial/fuzzy search).
 */
export const byIdsWithRiskQuerySchema = z
  .object({
    ids: z.string().trim().min(1),
    search: z.string().trim().min(1).optional(),
  })
  .strict();

export type ByIdsWithRiskQueryInput = z.infer<typeof byIdsWithRiskQuerySchema>;

/** Splits the comma-separated `ids` query param into an array, trimming each entry. */
export function parseIdsParam(ids: string): string[] {
  return ids
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
}
