import { z } from 'zod';

/** Partial update — every field optional, but at least one must be present. */
export const updateProjectSchema = z
  .object({
    funderId: z.string().uuid().nullable(),
    projectName: z.string().trim().min(1).max(80),
    financialYear: z.string().trim().min(1).max(9),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().nullable(),
    status: z.enum(['ACTIVE', 'PAUSED', 'CLOSED']),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
