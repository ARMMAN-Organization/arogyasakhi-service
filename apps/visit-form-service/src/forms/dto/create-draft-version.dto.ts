import { z } from 'zod';

/**
 * Body for `POST /admin/forms/:formCode/versions` — creates a new DRAFT
 * version. `cloneFromVersionId` optionally seeds it from an existing
 * version's schema/validation JSON as a starting point for editing.
 */
export const createDraftVersionSchema = z
  .object({
    cloneFromVersionId: z.string().uuid().optional(),
  })
  .strict();

export type CreateDraftVersionInput = z.infer<typeof createDraftVersionSchema>;
