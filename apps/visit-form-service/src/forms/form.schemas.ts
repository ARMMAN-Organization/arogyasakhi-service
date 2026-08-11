import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { formFieldSchema, crossFieldRuleSchema } from './dto/form-field.dto';

extendZodWithOpenApi(z);

/** Wraps a data schema in the standard success envelope for documentation. */
export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * One level of the caller's geography chain — only the fields a client needs
 * to map a level onto pii.<level>Id (geoType) and show to a user (name).
 * parentId/geoCode/status are internal/display-only and dropped here.
 */
const geographyUnitSchema = z.object({
  geographyUnitId: z.string().uuid().openapi({ example: '99999999-9999-9999-9999-999999999999' }),
  geoType: z
    .enum(['STATE', 'DISTRICT', 'BLOCK', 'PHC', 'SUBCENTRE', 'VILLAGE', 'PADA'])
    .openapi({ example: 'PHC' }),
  name: z.string().openapi({ example: 'Sample PHC' }),
});

/** Response shape for a form version (matches FormService.toApiFormVersion). */
export const formVersionSchema = z.object({
  id: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  formDefinitionId: z.string().uuid().openapi({ example: '5c1a2b3d-4e5f-6789-0abc-def012345678' }),
  versionNo: z.string().openapi({ example: 'v1' }),
  schemaJson: z.array(formFieldSchema),
  validationJson: z.array(crossFieldRuleSchema).nullable(),
  effectiveFrom: z.string().datetime().openapi({ example: '2026-07-20T00:00:00.000Z' }),
  effectiveTo: z.string().datetime().nullable().openapi({ example: null }),
  publishedByUserId: z
    .string()
    .uuid()
    .nullable()
    .openapi({ example: 'ba9c28fa-35fc-44e5-947c-eeca811bc052' }),
  status: z.enum(['DRAFT', 'PUBLISHED', 'RETIRED']).openapi({ example: 'PUBLISHED' }),
  createdAt: z.string().datetime().openapi({ example: '2026-07-20T00:00:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-07-20T00:00:00.000Z' }),
  // The form definition's configured RISK rule set, if any — lets a client
  // resolve formCode -> rule set -> rulesJson in one call instead of a
  // separate lookup. Null for forms with no risk evaluation configured
  // (e.g. SUPERVISOR/SYSTEM entityType forms).
  riskRuleSetId: z.string().uuid().nullable().openapi({ example: null }),
  // The calling Sakhi's full geography chain (state/district/block/PHC/
  // sub-centre/village/pada), ordered from her assigned unit up to STATE.
  // Omitted entirely when the caller has no geographyUnitId assigned.
  geography: z.array(geographyUnitSchema).optional().openapi({
    description:
      "The caller's geography chain, ordered from their assigned unit up to STATE. Omitted if the caller has no geography assigned.",
  }),
});

/** Response shape for a form submission (matches FormService.toApiFormSubmission). */
export const formSubmissionSchema = z.object({
  id: z.string().uuid().openapi({ example: '9a1b2c3d-4e5f-6789-0abc-def012345678' }),
  formVersionId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  beneficiaryId: z.string().uuid().openapi({ example: '34197cd7-7a54-4e7f-885c-f297313b9e81' }),
  visitId: z.string().uuid().nullable().openapi({ example: null }),
  submittedByUserId: z.string().uuid().openapi({ example: 'ba9c28fa-35fc-44e5-947c-eeca811bc052' }),
  submittedAt: z.string().datetime().openapi({ example: '2026-07-20T10:15:00.000Z' }),
  localSubmissionUuid: z.string().openapi({ example: 'device-abc-submission-001' }),
  formData: z
    .record(z.string(), z.unknown())
    .openapi({ example: { weightKg: 58, bpSystolic: 118 } }),
  validationStatus: z.enum(['VALID', 'INVALID', 'WARNING']).openapi({ example: 'VALID' }),
  createdAt: z.string().datetime().openapi({ example: '2026-07-20T10:15:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-07-20T10:15:00.000Z' }),
});
