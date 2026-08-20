import { z } from 'zod';

/**
 * Query params for `GET /beneficiaries/:beneficiaryId/visit-history`
 * (FR-S-4.6 — pre-visit health history). `formCode` and `visitType` are
 * both optional and repeatable (Express parses a repeated query key as an
 * array; a single value is normalized to a one-element array by the
 * service layer) — `visitType` (VisitSchedule.visitType, e.g. ANC/PP/NN/
 * INC/CCV) is resolved to its formCode via visit-code-form-map.ts, since
 * the actual filter runs against FormSubmission's own formCode. Providing
 * both narrows to the union of the two sets, same OR-combining convention
 * as findByPada's pendingStatusLookupValueIds/missedStatusLookupValueIds.
 *
 * `limit` defaults to 2 per FR-S-4.6 ("last 2 completed visits") — the
 * mobile client never needs more, but can ask for fewer/more via this
 * param.
 */
export const visitHistoryQuerySchema = z
  .object({
    formCode: z.union([z.string(), z.array(z.string())]).optional(),
    visitType: z.union([z.string(), z.array(z.string())]).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(2),
  })
  .strict();

export type VisitHistoryQueryInput = z.infer<typeof visitHistoryQuerySchema>;
