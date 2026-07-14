import { z } from 'zod';

/**
 * Validation schema for creating an incentive event. `.strict()` rejects
 * unknown fields, matching the previous global ValidationPipe
 * `forbidNonWhitelisted: true`.
 *
 * Only client-suppliable fields are included: system/audit-managed columns
 * (id, createdAt, updatedAt, isDeleted, deletedAt, createdByUserId,
 * updatedByUserId) are excluded since no auth context is wired into the
 * routers yet.
 */
export const createIncentiveEventSchema = z
  .object({
    sakhiId: z.string().uuid(),
    sourceEntityType: z.enum(['VISIT', 'REFERRAL', 'MEETING', 'TRAINING', 'RETAINER']),
    sourceEntityId: z.string().optional(),
    eventMonth: z.coerce.date(),
    rateId: z.string().uuid(),
    quantity: z.number().default(1),
    amountInr: z.number(),
    eligibilityStatus: z.enum(['ELIGIBLE', 'INELIGIBLE', 'PENDING', 'REVERSED']),
    calculatedAt: z.coerce.date(),
  })
  .strict();

export type CreateIncentiveEventInput = z.infer<typeof createIncentiveEventSchema>;
