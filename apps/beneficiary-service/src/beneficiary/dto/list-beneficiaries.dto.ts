import { z } from 'zod';
import { BENEFICIARY_STATUSES, CASE_TYPES } from '../beneficiary.constants';

const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be a date-only string (YYYY-MM-DD)');

/**
 * Query params for `GET /beneficiaries`, per SRS FR-S-9.2 ("Search by name
 * and mobile number. Filter by pada (multi-select) and risk level
 * (multi-select)") and the HLD's endpoint table ("List beneficiaries with
 * filters (project, geography, status, case type, risk)"). Only single-value
 * filters are supported for now — multi-select would need an `[]` query
 * shape, not modeled here since no caller needs it yet.
 *
 * `sakhiId` lets a SUPERVISOR/MANAGER/ADMIN caller scope the list to one
 * Sakhi's roster (a SAKHI caller's own id always wins regardless of this
 * param — see BeneficiaryService.list). `fromDate`/`toDate` range-filter on
 * registrationDate; `registeredFrom`/`registeredTo` are accepted as
 * equivalent aliases (the milestone's requested param names) — both pairs
 * are normalized onto `fromDate`/`toDate` before the service layer sees the
 * query, so BeneficiaryService/BeneficiaryRepository need no changes.
 * `cursor`/`limit` are the HLD-mandated cursor pagination — `cursor` is
 * opaque, returned as `nextCursor` in the response and passed back unchanged
 * for the next page.
 */
// Deliberately a plain z.object (AnyZodObject), not wrapped in .refine() —
// createDocumentedRouter() auto-infers this schema as the route's OpenAPI
// query parameters straight from the `validate(schema, 'query')` middleware,
// and zod-to-openapi cannot introspect a ZodEffects (what .refine()/.transform()
// produces) as a parameter object; it throws MissingParameterDataError at
// service startup, not a per-request error. So alias normalization can't
// live in this schema either — it happens in beneficiary.controller.ts,
// right after validate() parses the query, alongside the existing
// fromDate<=toDate cross-field check (in beneficiary.service.ts).
export const listBeneficiariesQuerySchema = z
  .object({
    projectId: z.string().uuid().optional(),
    villageId: z.string().uuid().optional(),
    padaId: z.string().uuid().optional(),
    sakhiId: z.string().uuid().optional(),
    status: z.enum(BENEFICIARY_STATUSES).optional(),
    caseType: z.enum(CASE_TYPES).optional(),
    atRiskOnly: z.coerce.boolean().optional(),
    name: z.string().trim().min(1).max(200).optional(),
    mobileNumber: z.string().trim().min(1).max(20).optional(),
    // Range filter on registrationDate — date-only strings (@db.Date column).
    fromDate: dateOnlySchema.optional(),
    toDate: dateOnlySchema.optional(),
    // Aliases for fromDate/toDate — see this schema's doc comment.
    registeredFrom: dateOnlySchema.optional(),
    registeredTo: dateOnlySchema.optional(),
    // Opaque, base64-encoded cursor — see beneficiary.repository.ts's encode/decodeCursor.
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListBeneficiariesQueryInput = z.infer<typeof listBeneficiariesQuerySchema>;

/**
 * Normalizes `registeredFrom`/`registeredTo` onto `fromDate`/`toDate` — an
 * explicit `fromDate`/`toDate` wins if a caller (incorrectly) sends both
 * forms for the same bound, rather than silently picking one.
 */
export function normalizeRegisteredDateAliases(
  query: ListBeneficiariesQueryInput,
): ListBeneficiariesQueryInput {
  return {
    ...query,
    fromDate: query.fromDate ?? query.registeredFrom,
    toDate: query.toDate ?? query.registeredTo,
  };
}
