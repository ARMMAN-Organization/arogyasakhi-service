import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { FormService } from './form.service';
import { createFormController } from './form.controller';
import { createDraftVersionSchema } from './dto/create-draft-version.dto';
import { patchFormVersionSchema } from './dto/patch-form-version.dto';
import { createSubmissionSchema } from './dto/create-submission.dto';
import { envelope, formSubmissionSchema, formVersionSchema } from './form.schemas';
import {
  errorResponse,
  requireRoles,
  trustGatewayIdentity,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

const formCodeParamsSchema = z
  .object({ formCode: z.string().trim().min(1).openapi({ example: 'ANC_VISIT' }) })
  .strict();
const versionParamsSchema = z
  .object({
    formCode: z.string().trim().min(1).openapi({ example: 'ANC_VISIT' }),
    versionId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  })
  .strict();
const activeVersionQuerySchema = z
  .object({ asOf: z.coerce.date().optional().openapi({ example: '2026-07-20T00:00:00.000Z' }) })
  .strict();

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
export function registerFormRoutes(doc: DocumentedRouter, service: FormService) {
  const controller = createFormController(service);

  doc.get(
    '/forms/visit-code-form-map',
    {
      summary:
        'Maps a VisitSchedule visitType (VisitCodeType) to the formCode a client must call ' +
        'GET /forms/:formCode/active-version and POST /forms/:formCode/submissions with. ' +
        'There is no separate form for an _HR visit type — an HR visit is filled using its ' +
        "base visit type's form (e.g. ANC_HR -> ANC_VISIT). Static; requires authentication " +
        'but no specific role, matching the other read routes on this router.',
      tags: ['Forms'],
      responses: {
        200: {
          description: 'visitType -> formCode map',
          schema: envelope(z.record(z.string(), z.string())),
        },
        401: errorResponse(401),
      },
    },
    trustGatewayIdentity,
    controller.getVisitCodeFormMap,
  );

  doc.get(
    '/forms/:formCode/active-version',
    {
      summary: 'Get the currently published version of a form',
      tags: ['Forms'],
      params: formCodeParamsSchema,
      query: activeVersionQuerySchema,
      responses: {
        200: { description: 'Active form version', schema: envelope(formVersionSchema) },
        400: errorResponse(400, { message: 'asOf: Invalid date' }),
        401: errorResponse(401),
        404: errorResponse(404, {
          message: 'No published version found for this form.',
          description: 'No published version for this form code',
        }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    validate(formCodeParamsSchema, 'params'),
    validate(activeVersionQuerySchema, 'query'),
    controller.getActiveVersion,
  );

  doc.post(
    '/admin/forms/:formCode/versions',
    {
      summary: 'Create a new draft version of a form',
      tags: ['Forms'],
      params: formCodeParamsSchema,
      responses: {
        201: { description: 'Draft version created', schema: envelope(formVersionSchema) },
        400: errorResponse(400, { message: 'cloneFromVersionId: Invalid uuid' }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, {
          message: 'Form not found.',
          description: 'Not found — unknown form code',
        }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validate(formCodeParamsSchema, 'params'),
    validateBody(createDraftVersionRequestSchema),
    controller.createDraft,
  );

  doc.patch(
    '/admin/forms/:formCode/versions/:versionId',
    {
      summary: "Edit a draft version's schema/validation JSON",
      tags: ['Forms'],
      params: versionParamsSchema,
      responses: {
        200: { description: 'Draft version updated', schema: envelope(formVersionSchema) },
        400: errorResponse(400, { message: 'schemaJson: Required' }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Form version not found.' }),
        409: errorResponse(409, {
          message: 'Only DRAFT versions can be edited.',
          description: 'Conflict — only DRAFT versions can be edited',
        }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validate(versionParamsSchema, 'params'),
    validateBody(patchFormVersionSchema),
    controller.updateDraft,
  );

  doc.post(
    '/admin/forms/:formCode/versions/:versionId/publish',
    {
      summary: 'Publish a draft version, making it the active one',
      tags: ['Forms'],
      params: versionParamsSchema,
      responses: {
        200: { description: 'Version published', schema: envelope(formVersionSchema) },
        400: errorResponse(400, { message: 'versionId: Invalid uuid' }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Form version not found.' }),
        409: errorResponse(409, {
          message: 'Only DRAFT versions can be published.',
          description: 'Conflict — only DRAFT versions can be published',
        }),
        422: errorResponse(422, {
          message: 'Draft has no well-formed fields to publish.',
          description: 'Unprocessable — draft schemaJson has no well-formed fields to publish',
        }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('ADMIN'),
    validate(versionParamsSchema, 'params'),
    controller.publish,
  );

  doc.post(
    '/forms/:formCode/submissions',
    {
      summary: 'Submit a filled-out form for a beneficiary',
      tags: ['Forms'],
      params: formCodeParamsSchema,
      responses: {
        201: { description: 'Submission recorded', schema: envelope(formSubmissionSchema) },
        400: errorResponse(400, { message: 'formVersionId: Required' }),
        401: errorResponse(401),
        404: errorResponse(404, {
          message: 'Form version not found.',
          description: 'Not found — unknown form code or form version',
        }),
        422: errorResponse(422, {
          message: 'Submission failed form validation.',
          description: 'Unprocessable — submission failed form validation',
        }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    validate(formCodeParamsSchema, 'params'),
    validateBody(createSubmissionRequestSchema),
    controller.createSubmission,
  );
}
