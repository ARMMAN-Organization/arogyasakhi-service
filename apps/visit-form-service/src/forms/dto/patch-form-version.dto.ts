import { z } from 'zod';
import { schemaJsonSchema, validationJsonSchema } from './form-field.dto';

/**
 * Body for `PATCH /admin/forms/:formCode/versions/:versionId` — replaces the
 * DRAFT's schema/validation JSON. This is the single endpoint an admin's
 * "add field" / "delete field" / "edit field" actions all call: the field
 * list is an array, so create/delete are just edits to that array, not
 * separate operations.
 */
export const patchFormVersionSchema = z
  .object({
    schemaJson: schemaJsonSchema,
    validationJson: validationJsonSchema.optional(),
  })
  .strict();

export type PatchFormVersionInput = z.infer<typeof patchFormVersionSchema>;
