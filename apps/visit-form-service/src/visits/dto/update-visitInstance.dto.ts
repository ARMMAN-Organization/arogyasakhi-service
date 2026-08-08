import { z } from 'zod';

/**
 * Validation schema for `PATCH /visits/:id` — lets a visit actually reach a
 * terminal status (COMPLETED/MISSED/etc.) after `POST /visits` created it.
 * `statusLookupValueId` is a plain scalar lookup_values id, same as
 * create-visitInstance.dto.ts — not cross-validated against auth-service's
 * VISIT_STATUS category here either, matching that existing precedent.
 */
export const updateVisitInstanceSchema = z
  .object({
    statusLookupValueId: z.string().uuid(),
    actualVisitDate: z.coerce.date().optional(),
    meetBeneficiaryFlag: z.boolean().optional(),
    notMetReason: z.string().trim().min(1).max(255).optional(),
  })
  .strict();

export type UpdateVisitInstanceInput = z.infer<typeof updateVisitInstanceSchema>;
