import { z } from 'zod';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date-only string (YYYY-MM-DD)');

/**
 * Shared query params for the registration-summary and risk-summary widgets —
 * same role-scoping/date-range filters as `GET /beneficiaries`
 * (listBeneficiariesQuerySchema), minus the fields a count-only aggregate has
 * no use for (pagination, name/mobile search, geography narrowing).
 * `registeredFrom`/`registeredTo` are accepted as aliases for `fromDate`/
 * `toDate` — see normalizeRegisteredDateAliases.
 */
export const summaryQuerySchema = z
  .object({
    sakhiId: z.string().uuid().optional(),
    fromDate: dateOnlySchema.optional(),
    toDate: dateOnlySchema.optional(),
    registeredFrom: dateOnlySchema.optional(),
    registeredTo: dateOnlySchema.optional(),
  })
  .strict();

export type SummaryQueryInput = z.infer<typeof summaryQuerySchema>;

/**
 * Normalizes `registeredFrom`/`registeredTo` onto `fromDate`/`toDate` — an
 * explicit `fromDate`/`toDate` wins if a caller sends both forms for the
 * same bound. Mirrors list-beneficiaries.dto.ts's alias for GET /beneficiaries.
 */
export function normalizeRegisteredDateAliases(query: SummaryQueryInput): SummaryQueryInput {
  return {
    ...query,
    fromDate: query.fromDate ?? query.registeredFrom,
    toDate: query.toDate ?? query.registeredTo,
  };
}
