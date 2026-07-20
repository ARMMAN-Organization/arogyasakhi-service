import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { FormService } from './form.service';
import { createDraftVersionSchema } from './dto/create-draft-version.dto';
import { patchFormVersionSchema } from './dto/patch-form-version.dto';
import { createSubmissionSchema } from './dto/create-submission.dto';
import { formFieldSchema, crossFieldRuleSchema } from './dto/form-field.dto';
import {
  asyncHandler,
  createDocumentedRouter,
  ok,
  requireRoles,
  trustGatewayIdentity,
  unauthorized,
  validate,
  validateBody,
} from '../app.module';

extendZodWithOpenApi(z);

const formCodeParamsSchema = z.object({ formCode: z.string().trim().min(1) }).strict();
const versionParamsSchema = z
  .object({ formCode: z.string().trim().min(1), versionId: z.string().uuid() })
  .strict();
const activeVersionQuerySchema = z.object({ asOf: z.coerce.date().optional() }).strict();

// Request DTOs annotated with examples for Swagger UI; validation behavior is
// unchanged (`.openapi()` only attaches documentation metadata).
const createDraftVersionRequestSchema = createDraftVersionSchema.extend({
  cloneFromVersionId: createDraftVersionSchema.shape.cloneFromVersionId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
});

const createSubmissionRequestSchema = createSubmissionSchema.extend({
  formVersionId: createSubmissionSchema.shape.formVersionId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  beneficiaryId: createSubmissionSchema.shape.beneficiaryId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  localSubmissionUuid: createSubmissionSchema.shape.localSubmissionUuid.openapi({
    example: 'device-abc-submission-001',
  }),
});

const formVersionSchema = z.object({
  id: z.string().uuid(),
  formDefinitionId: z.string().uuid(),
  versionNo: z.string().openapi({ example: 'v1' }),
  schemaJson: z.array(formFieldSchema),
  validationJson: z.array(crossFieldRuleSchema).nullable(),
  effectiveFrom: z.string().datetime(),
  effectiveTo: z.string().datetime().nullable(),
  publishedByUserId: z.string().uuid().nullable(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'SUPERSEDED', 'RETIRED']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const formSubmissionSchema = z.object({
  id: z.string().uuid(),
  formVersionId: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  visitId: z.string().uuid().nullable(),
  submittedByUserId: z.string().uuid(),
  submittedAt: z.string().datetime(),
  localSubmissionUuid: z.string().openapi({ example: 'device-abc-submission-001' }),
  formDataJson: z.record(z.string(), z.unknown()),
  validationStatus: z.enum(['VALID', 'INVALID']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  details: z.record(z.unknown()).optional(),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Dynamic-forms HTTP routes (Layer 1 only — form mechanics, not the
 * per-domain consequence of a submission). Mounted under the global
 * `api/v1` prefix. Admin routes (draft/patch/publish) are ADMIN-only,
 * matching the HLD's admin/rules endpoint pattern this mirrors; the
 * read/submit routes require authentication but no specific role, since
 * the HLD doesn't name exact roles per form code (flagged in the forms API
 * design doc §7 rather than guessed here).
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body/params
 * schema is inferred from `validateBody`/`validate` already in the
 * middleware chain, so `/docs.json` can never drift from what's actually
 * mounted.
 */
export function createFormRouter(service: FormService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/forms/:formCode/active-version',
    {
      summary: 'Get the currently published version of a form',
      tags: ['Forms'],
      params: formCodeParamsSchema,
      query: activeVersionQuerySchema,
      responses: {
        200: { description: 'Active form version', schema: envelope(formVersionSchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        404: { description: 'No published version for this form code', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    validate(formCodeParamsSchema, 'params'),
    validate(activeVersionQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      const { formCode } = req.params as unknown as { formCode: string };
      const { asOf } = req.query as unknown as { asOf?: Date };
      const version = await service.getActiveVersion(formCode, asOf ?? new Date());
      res.json(ok(version));
    }),
  );

  doc.post(
    '/admin/forms/:formCode/versions',
    {
      summary: 'Create a new draft version of a form',
      tags: ['Forms'],
      params: formCodeParamsSchema,
      responses: {
        201: { description: 'Draft version created', schema: envelope(formVersionSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Unknown form code', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validate(formCodeParamsSchema, 'params'),
    validateBody(createDraftVersionRequestSchema),
    asyncHandler(async (req, res) => {
      const { formCode } = req.params as unknown as { formCode: string };
      const created = await service.createDraft(formCode, req.body);
      res.status(201).json(ok(created));
    }),
  );

  doc.patch(
    '/admin/forms/:formCode/versions/:versionId',
    {
      summary: "Edit a draft version's schema/validation JSON",
      tags: ['Forms'],
      params: versionParamsSchema,
      responses: {
        200: { description: 'Draft version updated', schema: envelope(formVersionSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Form version not found', schema: apiErrorSchema },
        409: { description: 'Only DRAFT versions can be edited', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validate(versionParamsSchema, 'params'),
    validateBody(patchFormVersionSchema),
    asyncHandler(async (req, res) => {
      const { formCode, versionId } = req.params as unknown as {
        formCode: string;
        versionId: string;
      };
      const updated = await service.updateDraft(formCode, versionId, req.body);
      res.json(ok(updated));
    }),
  );

  doc.post(
    '/admin/forms/:formCode/versions/:versionId/publish',
    {
      summary: 'Publish a draft version, making it the active one',
      tags: ['Forms'],
      params: versionParamsSchema,
      responses: {
        200: { description: 'Version published', schema: envelope(formVersionSchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Form version not found', schema: apiErrorSchema },
        409: { description: 'Only DRAFT versions can be published', schema: apiErrorSchema },
        422: {
          description: 'Draft schemaJson has no well-formed fields to publish',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validate(versionParamsSchema, 'params'),
    asyncHandler(async (req, res) => {
      const { formCode, versionId } = req.params as unknown as {
        formCode: string;
        versionId: string;
      };
      const published = await service.publish(formCode, versionId);
      res.json(ok(published));
    }),
  );

  doc.post(
    '/forms/:formCode/submissions',
    {
      summary: 'Submit a filled-out form for a beneficiary',
      tags: ['Forms'],
      params: formCodeParamsSchema,
      responses: {
        201: { description: 'Submission recorded', schema: envelope(formSubmissionSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        422: { description: 'Submission failed form validation', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    validate(formCodeParamsSchema, 'params'),
    validateBody(createSubmissionRequestSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const { formCode } = req.params as unknown as { formCode: string };
      const created = await service.createSubmission(formCode, req.body, req.user.id);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
