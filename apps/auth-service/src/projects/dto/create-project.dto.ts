import { z } from 'zod';

/**
 * Validation schema for creating a project. Fields match `projects`
 * (docs/Arogya_Sakhi_Database_Design_ERD_Table_Definitions.docx.md) —
 * `status`/audit columns are server-set, not client input. `.strict()`
 * rejects unknown fields, matching the repo's global convention.
 */
export const createProjectSchema = z
  .object({
    funderId: z.string().uuid().optional(),
    projectCode: z.string().trim().min(1).max(80),
    projectName: z.string().trim().min(1).max(80),
    financialYear: z.string().trim().min(1).max(9),
    startDate: z.coerce.date(),
    endDate: z.coerce.date().optional(),
  })
  .strict();

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
