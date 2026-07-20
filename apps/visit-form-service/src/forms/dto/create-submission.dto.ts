import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

/**
 * Body for `POST /forms/:formCode/submissions`. Fields match
 * form_submissions (docs/Arogya_Sakhi_Database_Design_ERD_Table_Definitions.docx.md,
 * Appendix A) exactly — no invented fields. `formData` is the generic
 * label->value bag that becomes `form_data_json`; its keys are validated at
 * the service layer against the live form_version's schema_json, not here,
 * since the set of valid question_codes is dynamic per form version.
 *
 * `submittedByUserId` is NOT part of this schema — per beneficiary-service's
 * existing convention, the submitter's identity comes from the authenticated
 * caller (`req.user.id`, set by `trustGatewayIdentity`), never from the
 * request body, so a caller can't submit while claiming to be someone else.
 */
export const createSubmissionSchema = z
  .object({
    formVersionId: z.string().uuid(),
    beneficiaryId: z.string().uuid(),
    visitId: z.string().uuid().nullable().optional(),
    localSubmissionUuid: z.string().trim().min(1).max(80),
    // z.record(_, z.any()) has no inferable OpenAPI type — annotated so the
    // OpenAPI generator doesn't throw when this schema is used as a
    // documented request body (see createDocumentedRouter()).
    formData: z.record(z.string(), z.any()).openapi({ type: 'object' }),
  })
  .strict();

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
