import { z } from 'zod';

/**
 * Validation schema for POST /edd-nearing-requests/:id/acknowledge. Empty
 * on purpose — EDD Nearing supports exactly one action ("Okay"), with no
 * reason code and no reject path (SRS), so there is nothing for the caller
 * to supply. `.strict()` still rejects any unexpected field.
 */
export const acknowledgeEddNearingSchema = z.object({}).strict();

export type AcknowledgeEddNearingInput = z.infer<typeof acknowledgeEddNearingSchema>;
