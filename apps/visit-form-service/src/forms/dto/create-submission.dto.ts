import { z } from 'zod';

/**
 * Body for `POST /forms/:formCode/submissions`. Fields match
 * form_submissions (docs/Arogya_Sakhi_Database_Design_ERD_Table_Definitions.docx.md,
 * Appendix A) exactly — no invented fields. `formData` is the generic
 * label->value bag that becomes `form_data_json`; its keys are validated at
 * the service layer against the live form_version's schema_json, not here,
 * since the set of valid question_codes is dynamic per form version.
 */
export const createSubmissionSchema = z
  .object({
    formVersionId: z.string().uuid(),
    beneficiaryId: z.string().uuid(),
    visitId: z.string().uuid().nullable().optional(),
    submittedByUserId: z.string().uuid(),
    localSubmissionUuid: z.string().trim().min(1).max(80),
    formData: z.record(z.string(), z.unknown()),
  })
  .strict();

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
