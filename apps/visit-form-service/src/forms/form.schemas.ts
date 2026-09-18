import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { formFieldSchema, crossFieldRuleSchema } from './dto/form-field.dto';

extendZodWithOpenApi(z);

/** Wraps a data schema in the standard success envelope for documentation. */
export function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * One level of the caller's geography chain — geoType/name are what a
 * client shows to a user; geoCode/status are internal and dropped.
 * parentGeographyUnitId (frontend request following CR-237's multi-pada
 * fix) is the real geography_units.parentId — null only for STATE, the
 * top level. Lets a client reconstruct the actual
 * STATE -> DISTRICT -> BLOCK -> VILLAGE -> SUBCENTRE -> PHC -> PADA tree
 * itself: once a SAKHI can have multiple assignments, this array can
 * contain more than one DISTRICT/BLOCK/etc. with no other way to tell
 * which one nests under which.
 */
const geographyUnitSchema = z.object({
  geographyUnitId: z.string().uuid().openapi({ example: '99999999-9999-9999-9999-999999999999' }),
  geoType: z
    .enum(['STATE', 'DISTRICT', 'BLOCK', 'PHC', 'SUBCENTRE', 'VILLAGE', 'PADA'])
    .openapi({ example: 'PHC' }),
  name: z.string().openapi({ example: 'Sample PHC' }),
  parentGeographyUnitId: z
    .string()
    .uuid()
    .nullable()
    .openapi({ example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }),
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
  childBeneficiaries: z
    .array(
      z.object({
        birthOrder: z.number().int().openapi({
          description: '1-based DELIVERY_VISIT child slot (1 = child1, 2 = child2, 3 = child3).',
          example: 1,
        }),
        localChildId: z
          .string()
          .nullable()
          .openapi({
            description:
              "The mobile client's own identifier for this birth slot, echoed back from " +
              "that slot's childN_local_id in the submission (CR-041 item 2.4) — lets an " +
              'offline-first client match this beneficiaryId to the local placeholder ' +
              'record it already created before syncing. Null if the client sent nothing ' +
              'for this slot.',
            example: 'device-abc-child1',
          }),
        beneficiaryId: z.string().uuid().openapi({
          description: 'The server-assigned CHILD beneficiary case id for this slot.',
          example: '34197cd7-7a54-4e7f-885c-f297313b9e81',
        }),
      }),
    )
    .optional()
    .openapi({
      description:
        'The CHILD beneficiary cases auto-created from this submission, one entry per ' +
        'birth slot that actually resulted in a created case — present only for a ' +
        'DELIVERY_VISIT submission with at least one live birth. A stillborn or ' +
        'otherwise-failed slot has no entry at all (not a null-beneficiaryId entry). ' +
        'Omitted entirely (not an empty array) when no child case was created.',
      example: [
        {
          birthOrder: 1,
          localChildId: 'device-abc-child1',
          beneficiaryId: '34197cd7-7a54-4e7f-885c-f297313b9e81',
        },
      ],
    }),
  stageEducationContent: z
    .array(
      z.object({
        id: z.string().uuid().openapi({
          description: 'The originating HealthEducationMessage.id.',
        }),
        topicCode: z.string(),
        topicName: z.string(),
        bodyEn: z.string().openapi({
          description: 'Full English counselling text.',
        }),
        bodyMarathi: z.string().openapi({
          description:
            'Full Marathi counselling text where ARMMAN has delivered it, else the literal ' +
            '"Marathi content coming soon" placeholder string.',
        }),
        mediaType: z.string(),
        contentUrl: z
          .string()
          .nullable()
          .openapi({
            description:
              'Raw HealthEducationMessage.mediaFile label/filename (e.g. "anaemia") — NOT a ' +
              'resolvable URL. See mediaResolvedUrl.',
          }),
        mediaResolvedUrl: z
          .string()
          .nullable()
          .openapi({
            description:
              "Absolute, playable URL for contentUrl, resolved via cms-content-service's " +
              'Strapi-backed media pipeline. Null until an admin-triggered ' +
              'POST /health-education/media-sync run has matched this message against a ' +
              'Strapi entry.',
          }),
      }),
    )
    .optional()
    .openapi({
      description:
        "The SRS's stage-based (not risk-graded) health-education content applicable to " +
        'this submission — e.g. Danger Signs on every ANC visit, POSTPARTUM Counselling on ' +
        'every PP visit, Neonatal Care on NN1/NN2, gestational-week/age-gated content, and ' +
        'pregnancy-loss content on a qualifying closure or delivery outcome. Always an ' +
        "array (possibly empty) once present — distinct from childBeneficiaries's " +
        '"omit if empty" convention. Independent of risk-referral-service\'s risk-flag-' +
        'triggered educationContent (GET /beneficiaries/:id/risk) — see ' +
        "healthEducationStage.resolver.ts's own doc comment for why these are two " +
        'separate mechanisms.',
      example: [],
    }),
});
