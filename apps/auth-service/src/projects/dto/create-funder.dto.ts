import { z } from 'zod';

/** Validation schema for creating a funder. Fields match `funders` (ERD). */
export const createFunderSchema = z
  .object({
    funderCode: z.string().trim().min(1).max(50),
    funderName: z.string().trim().min(1).max(40),
  })
  .strict();

export type CreateFunderInput = z.infer<typeof createFunderSchema>;
