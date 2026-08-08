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
 *
 * `amountInr` is deliberately NOT a field here — since SUPERVISOR (not just
 * ADMIN) can call this endpoint (see incentiveEvent.controller.ts's roles,
 * needed for the ACCOMPANIED_REFERRAL incentive trigger), trusting a
 * client-supplied amount would let any Supervisor mint an incentive event
 * for an arbitrary payout. The service re-derives amountInr from `rateId`
 * server-side instead (see IncentiveEventService.create) — never taken from
 * the request body, regardless of caller role.
 */
export const createIncentiveEventSchema = z
  .object({
    sakhiId: z.string().uuid(),
    sourceEntityType: z.enum(['VISIT', 'REFERRAL', 'MEETING', 'TRAINING', 'RETAINER']),
    sourceEntityId: z.string().optional(),
    eventMonth: z.coerce.date(),
    rateId: z.string().uuid(),
    quantity: z.number().default(1),
    eligibilityStatus: z.enum(['ELIGIBLE', 'INELIGIBLE', 'PENDING', 'REVERSED']),
    calculatedAt: z.coerce.date(),
  })
  .strict();

export type CreateIncentiveEventInput = z.infer<typeof createIncentiveEventSchema>;
