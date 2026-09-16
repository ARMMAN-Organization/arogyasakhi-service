import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { FormService } from './form.service';
import { createFormController } from './form.controller';
import { createDraftVersionSchema } from './dto/create-draft-version.dto';
import { patchFormVersionSchema } from './dto/patch-form-version.dto';
import { createSubmissionSchema } from './dto/create-submission.dto';
import { patchFormSubmissionAnswersSchema } from './dto/patch-formSubmissionAnswers.dto';
import { submissionHistoryQuerySchema } from './dto/submission-history-query.dto';
import { listFormSubmissionsQuerySchema } from './dto/list-form-submissions.dto';
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
  .object({
    asOf: z.coerce.date().optional().openapi({ example: '2026-07-20T00:00:00.000Z' }),
    // Only consulted for NEONATAL_VISIT today — see
    // FormService.getActiveVersion's prefilledContext block — but accepted
    // generically here so future forms can opt into the same mechanism
    // without a route change.
    beneficiaryId: z.string().uuid().optional(),
  })
  .strict();
const beneficiaryIdParamsSchema = z.object({ beneficiaryId: z.string().uuid() }).strict();
const submissionIdParamsSchema = z.object({ id: z.string().uuid() }).strict();

const vitalsSnapshotSchema = z.object({
  visitId: z.string().uuid().nullable(),
  submittedAt: z.string().datetime().nullable(),
  weightKg: z.number().nullable(),
  systolicBp: z.number().nullable(),
  diastolicBp: z.number().nullable(),
  temperatureF: z.number().nullable(),
  hemoglobinGDl: z.number().nullable(),
  muacCm: z.number().nullable(),
  respiratoryRate: z.number().nullable(),
});

const deliveryOutcomeSchema = z.object({
  birthOrder: z.number().int().positive().openapi({
    example: 1,
    description: '1-based child slot (child1/child2/child3) on the DELIVERY_VISIT form.',
  }),
  outcome: z.string().openapi({ example: 'live_birth' }),
});

const submissionHistoryVisitScheduleSchema = z
  .object({
    scheduleId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
    scheduledDate: z.string().datetime().openapi({ example: '2026-03-01T00:00:00.000Z' }),
    status: z.string().openapi({ example: 'COMPLETED' }),
    sequenceNo: z.number().int().nullable().openapi({ example: 3 }),
  })
  .nullable();

const submissionHistoryItemSchema = z.object({
  submissionId: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  formCode: z.string().openapi({ example: 'ANC_VISIT' }),
  submittedAt: z.string().datetime().openapi({ example: '2026-03-01T10:00:00.000Z' }),
  answers: z.record(z.string(), z.unknown()).openapi({
    example: { blood_pressure_bp_systolic: 120 },
    description: "The submission's full formDataJson payload, unmodified.",
  }),
  visitSchedule: submissionHistoryVisitScheduleSchema.openapi({
    description:
      'The linked VisitSchedule context (via FormSubmission.visitId), or null for a ' +
      'submission not tied to a visit (e.g. MOTHER_REGISTRATION).',
  }),
});

const submissionHistoryResponseSchema = z.object({
  items: z.array(submissionHistoryItemSchema),
  nextCursor: z.string().nullable().openapi({
    description: 'Opaque cursor for the next page, or null when there are no more results.',
  }),
});

const deliveryOutcomesSchema = z.object({
  outcomes: z.array(deliveryOutcomeSchema).openapi({
    example: [
      { birthOrder: 1, outcome: 'live_birth' },
      { birthOrder: 2, outcome: 'antepartum_still_birth_fresh' },
    ],
    description:
      'One entry per child slot that has a delivery outcome recorded on this ' +
      "mother's most recent DELIVERY_VISIT submission, each tagged with its own " +
      'birthOrder — a missing/unanswered slot is simply absent, never shifts the ' +
      'birthOrder of the slots after it. Empty if the mother has no DELIVERY_VISIT ' +
      'submission yet.',
  }),
});

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
    '/form-submissions',
    {
      summary:
        "Cursor-paginated form-submission list, scoped by sakhiId — backs FR-SV-4.6's Data " +
        "Restore flow (a Sakhi's device re-downloading everything scoped to her after a " +
        'reset/reinstall). FormSubmission carries no sakhiId column of its own — the in-scope ' +
        'beneficiaryIds are resolved via beneficiary-service GET /beneficiaries/ids, which ' +
        'applies the same role-scoping GET /visits uses: SAKHI always sees only her own ' +
        'submissions regardless of the sakhiId query param; SUPERVISOR sees one roster ' +
        'sakhiId or, if omitted, her whole roster; MANAGER/ADMIN may pass any sakhiId or omit ' +
        'it for fully unscoped. Excludes soft-deleted rows. Each item is the full stored ' +
        'submission (formData included), same shape as POST /forms/:formCode/submissions ' +
        'returns.',
      tags: ['Forms'],
      query: listFormSubmissionsQuerySchema,
      responses: {
        200: {
          description: 'Form submissions retrieved',
          schema: envelope(
            z.object({
              items: z.array(formSubmissionSchema),
              nextCursor: z.string().nullable().openapi({
                description:
                  'Pass back as `cursor` to fetch the next page; null when this is the last page.',
              }),
            }),
          ),
        },
        400: errorResponse(400),
        401: errorResponse(401),
        403: errorResponse(403, { message: "sakhiId is not in this Supervisor's roster." }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(listFormSubmissionsQuerySchema, 'query'),
    controller.list,
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

  doc.get(
    '/beneficiaries/:beneficiaryId/latest-visit-vitals',
    {
      summary:
        "The beneficiary's most recent visit-linked clinical submission's vitals " +
        '(weight/BP/temperature/hemoglobin/MUAC/respiratory rate), projected out of that ' +
        "visit's formDataJson per its own form's question_codes (ANC_VISIT/POSTPARTUM_VISIT/" +
        'NEONATAL_VISIT/INC_VISIT/CCV_VISIT — the only visit forms that capture vitals; ' +
        '*_CLOSURE_VISIT and one-time forms like MOTHER_REGISTRATION never contribute). Fields ' +
        "the visit's own form doesn't ask are null, not omitted — the response shape never " +
        'depends on which visit type was most recent. Returns an all-null snapshot (not 404) ' +
        'when the beneficiary has never had a visit-linked clinical submission.',
      tags: ['Forms'],
      params: beneficiaryIdParamsSchema,
      responses: {
        200: {
          description: "The beneficiary's latest visit vitals (or an all-null snapshot)",
          schema: envelope(vitalsSnapshotSchema),
        },
        400: errorResponse(400, { message: 'beneficiaryId: Invalid uuid' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: 'This beneficiary case is outside your own roster.' }),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    validate(beneficiaryIdParamsSchema, 'params'),
    controller.getLatestVisitVitals,
  );

  doc.get(
    '/beneficiaries/:beneficiaryId/submissions',
    {
      summary:
        "A beneficiary's full form submission history — CR-DeviceContinuity-01 (issue #228): " +
        'when a Sakhi loses her device, visit schedules (generated on-device from submitted ' +
        'form history) do not reappear on a new one; the mobile client replays this endpoint ' +
        "to rebuild them. Returns every non-deleted submission's formCode, submittedAt, full " +
        'answers (formDataJson, unmodified), and the linked VisitSchedule context where the ' +
        'submission is visit-linked (null for one-time forms like MOTHER_REGISTRATION). ' +
        'Ordered submittedAt asc, id asc (oldest first) so the client can replay ' +
        'chronologically. Cursor-paginated, same convention as GET /beneficiaries (opaque ' +
        'cursor, returned as nextCursor, passed back unchanged for the next page). Same ' +
        'ownership scoping as GET /beneficiaries/:beneficiaryId/visit-history: SAKHI must own ' +
        'the beneficiary case herself, SUPERVISOR only via her own roster, MANAGER/ADMIN ' +
        'unrestricted.',
      tags: ['Forms'],
      params: beneficiaryIdParamsSchema,
      query: submissionHistoryQuerySchema,
      responses: {
        200: {
          description: "The beneficiary's submission history, oldest first",
          schema: envelope(submissionHistoryResponseSchema),
        },
        400: errorResponse(400, { message: 'limit: Number must be less than or equal to 100' }),
        401: errorResponse(401),
        403: errorResponse(403, { message: 'This beneficiary case is outside your own roster.' }),
        404: errorResponse(404, { message: 'Beneficiary case not found.' }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(beneficiaryIdParamsSchema, 'params'),
    validate(submissionHistoryQuerySchema, 'query'),
    controller.getSubmissionHistory,
  );

  doc.get(
    '/beneficiaries/:beneficiaryId/delivery-outcomes',
    {
      summary:
        "Per-slot delivery outcomes (child1/child2/child3) from this mother's most recent " +
        'DELIVERY_VISIT submission, if any. Called by beneficiary-service before creating a ' +
        'new CHILD case for this mother, to block creating a separate record for a child ' +
        'already recorded as stillbirth (SRS §G.4: "no child journey is initiated"). ' +
        'Service-to-service only — SAKHI is the caller identity beneficiary-service forwards, ' +
        'not a Sakhi reading another beneficiary directly. Returns an empty array (not 404) ' +
        'when the mother has no DELIVERY_VISIT submission yet.',
      tags: ['Forms'],
      params: beneficiaryIdParamsSchema,
      responses: {
        200: {
          description: "The mother's latest DELIVERY_VISIT per-slot outcomes (or none)",
          schema: envelope(deliveryOutcomesSchema),
        },
        400: errorResponse(400, { message: 'beneficiaryId: Invalid uuid' }),
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    validate(beneficiaryIdParamsSchema, 'params'),
    controller.getDeliveryOutcomes,
  );

  doc.patch(
    '/form-submissions/:id/answers',
    {
      summary:
        'Edits a SRS Appendix J.4 "post-submission editable field" answer on an already-' +
        'submitted form — the only way (besides the dedicated LMP-correction/Supervisor-' +
        'approval flow, which this endpoint deliberately excludes) a Sakhi can correct an ' +
        'already-submitted answer without approval. All-or-nothing: if any edit names a ' +
        "fieldCode that isn't on the submission's own form, or isn't allowlisted for that " +
        'form code, none of the edits in the request are applied. Every applied edit is ' +
        "written to audit-service's audit log (action FORM_ANSWER_EDIT) with both the prior " +
        'and new value of each edited field.',
      tags: ['Forms'],
      params: submissionIdParamsSchema,
      responses: {
        200: { description: 'Answers updated', schema: envelope(formSubmissionSchema) },
        400: errorResponse(400, {
          message: 'Unknown fieldCode(s) for form "MOTHER_REGISTRATION": not_a_real_field.',
        }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'Form submission not found.' }),
        422: errorResponse(422, {
          message:
            'The following field(s) are not editable after submission for form ' +
            '"MOTHER_REGISTRATION": lmp_date.',
        }),
        500: errorResponse(500),
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validate(submissionIdParamsSchema, 'params'),
    validateBody(patchFormSubmissionAnswersSchema),
    controller.updateSubmissionAnswers,
  );
}
