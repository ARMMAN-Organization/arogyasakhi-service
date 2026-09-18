import { z } from 'zod';

/**
 * Body for `PATCH /beneficiaries/:id/delivery-date` — records a MOTHER
 * case's delivery date on `MotherCaseDetails.dateOfDelivery`. Called
 * server-to-server by visit-form-service when a DELIVERY_VISIT is
 * submitted, forwarding the submitting Sakhi's own token.
 *
 * Feeds FR-S-2.5's re-enrolment duplicate-detection prompt
 * (beneficiary.duplicate-detection.ts) — without this write, a completed
 * prior pregnancy can never be told apart from an open one, since the
 * duplicate-detection logic needs a confirmed delivery date to know the
 * journey actually finished.
 */
export const applyDeliveryDateSchema = z
  .object({
    dateOfDelivery: z.coerce.date(),
  })
  .strict();

export type ApplyDeliveryDateInput = z.infer<typeof applyDeliveryDateSchema>;
