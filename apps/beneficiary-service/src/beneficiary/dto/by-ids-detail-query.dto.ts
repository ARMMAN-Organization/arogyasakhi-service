import { badRequest } from '@armman/service-commons';
import { z } from 'zod';

/**
 * Query params for `GET /beneficiaries/by-ids-detail`. `ids` is a
 * comma-separated list of beneficiary ids — kept as a plain string here (not
 * `.transform()`ed), same reason as `by-ids-with-risk-query.dto.ts`'s `ids`:
 * `createDocumentedRouter()` cannot introspect a ZodEffects as an OpenAPI
 * parameter object. The split into an array (and per-id uuid validation)
 * happens in the controller via `parseAndValidateIdsParam`.
 */
export const byIdsDetailQuerySchema = z
  .object({
    ids: z.string().trim().min(1),
  })
  .strict();

export type ByIdsDetailQueryInput = z.infer<typeof byIdsDetailQuerySchema>;

const uuidSchema = z.string().uuid();

/**
 * Splits the comma-separated `ids` query param into an array of uuids,
 * trimming each entry. Unlike `by-ids-with-risk-query.dto.ts`'s
 * `parseIdsParam`, this throws `badRequest` on any entry that isn't a valid
 * uuid: this endpoint returns full case/PII detail per id, so a malformed id
 * is rejected outright rather than silently passed through to a Prisma query
 * that would just match nothing.
 */
export function parseAndValidateIdsParam(ids: string): string[] {
  return ids
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)
    .map((id) => {
      const result = uuidSchema.safeParse(id);
      if (!result.success) {
        throw badRequest(`ids: '${id}' is not a valid uuid.`);
      }
      return result.data;
    });
}
