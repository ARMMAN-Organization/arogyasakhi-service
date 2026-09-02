import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { ReferralService } from './referral.service';
import { createReferralSchema } from './dto/create-referral.dto';
import { decideReferralSchema } from './dto/decide-referral.dto';
import { decideReferralAliasSchema } from './dto/decide-referral-alias.dto';
import { countByBeneficiarySchema } from './dto/count-by-beneficiary.dto';
import { followupsByBeneficiarySchema } from './dto/followups-by-beneficiary.dto';
import { decisionStatusQuerySchema } from './dto/decision-status-query.dto';
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

/** Query params for GET /referrals/referral-summary — see referral.service.ts's getSummary. */
const referralSummaryQuerySchema = z.object({ sakhiId: z.string().uuid().optional() }).strict();

/**
 * Query params for GET /referrals — `beneficiaryId` narrows the
 * most-recent-50 list to one beneficiary's referrals; omitting it keeps the
 * existing unfiltered behavior.
 */
const listReferralsQuerySchema = z.object({ beneficiaryId: z.string().uuid().optional() }).strict();

// Request DTO annotated with examples for Swagger UI; validation behavior is
// unchanged (`.openapi()` only attaches documentation metadata).
const createReferralRequestSchema = createReferralSchema.extend({
  beneficiaryId: createReferralSchema.shape.beneficiaryId.openapi({
    example: '3f3a8b0e-6b1a-4f2a-8f0a-3b6a0d9c1e2f',
  }),
  referralTypeLookupValueId: createReferralSchema.shape.referralTypeLookupValueId.openapi({
    example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  }),
  referralDate: createReferralSchema.shape.referralDate.openapi({
    example: '2026-07-16T00:00:00.000Z',
  }),
  status: createReferralSchema.shape.status.openapi({ example: 'INITIATED' }),
  // Built on z.lazy() (see create-referral.dto.ts) — zod-to-openapi cannot
  // introspect z.lazy() on its own, so `type: 'object'` is required here to
  // short-circuit its type inference.
  triggerConditionListJson: createReferralSchema.shape.triggerConditionListJson.openapi({
    type: 'object',
    example: { conditions: [] },
  }),
});

const referralSchema = z.object({
  id: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  visitId: z.string().uuid().nullable(),
  sourceSubmissionId: z.string().uuid().nullable(),
  referralTypeLookupValueId: z.string().uuid(),
  referralDate: z.string().datetime(),
  triggerConditionListJson: z.unknown().nullable(),
  facilityType: z.enum(['PUBLIC', 'PRIVATE', 'PHC', 'RH', 'DH', 'OTHER']).nullable(),
  facilityName: z.string().nullable(),
  photoEvidenceMediaAssetId: z.string().uuid().nullable(),
  status: z.enum(['INITIATED', 'PENDING_FOLLOWUP', 'COMPLETED', 'LAPSED', 'SKIPPED', 'CANCELLED']),
  validTill: z.string().datetime().nullable(),
  supervisorApprovalStatus: z.enum(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED']),
  // Not `.uuid()` — the platform's real identity values aren't guaranteed to
  // be UUIDs (audit-service's own auditLogRecordSchema documents
  // actorUserId: z.string() with an example like 'jane.sakhi').
  decidedByUserId: z.string().nullable(),
  decidedAt: z.string().datetime().nullable(),
  decisionNotes: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const referralIdParamsSchema = z
  .object({ id: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }) })
  .strict();

const decideReferralRequestSchema = decideReferralSchema.extend({
  decision: decideReferralSchema.shape.decision.openapi({ example: 'LAPSE' }),
});

const decideReferralAliasRequestSchema = decideReferralAliasSchema.extend({
  decision: decideReferralAliasSchema.shape.decision.openapi({ example: 'APPROVE' }),
});

const referralSummarySchema = z.object({
  accompaniedReferralsCount: z.number().int(),
  pendingFollowUpsCount: z.number().int(),
});

const pendingFollowupsByBeneficiaryResponseSchema = z.record(
  z.string(),
  z.object({
    pendingCount: z.number().int(),
    overdueCount: z.number().int(),
  }),
);

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  details: z.record(z.unknown()).optional(),
});

const decisionStatusRowSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['INITIATED', 'PENDING_FOLLOWUP', 'COMPLETED', 'LAPSED', 'SKIPPED', 'CANCELLED']),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Referral HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body schema is
 * inferred from `validateBody` already in the middleware chain, so
 * `/docs.json` can never drift from what's actually mounted.
 */
export function createReferralRouter(service: ReferralService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/referrals',
    {
      summary:
        'List the most recent referrals (most-recent-50). Optional `beneficiaryId` narrows ' +
        "this to one beneficiary's referrals.",
      tags: ['Referrals'],
      query: listReferralsQuerySchema,
      responses: {
        200: { description: 'Referrals list', schema: envelope(z.array(referralSchema)) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    validate(listReferralsQuerySchema, 'query'),
    asyncHandler(async (req, res) => {
      const { beneficiaryId } = req.query as unknown as z.infer<typeof listReferralsQuerySchema>;
      res.json(ok(await service.list(beneficiaryId)));
    }),
  );

  doc.get(
    '/referrals/referral-summary',
    {
      summary:
        'Referral Summary widget — accompaniedReferralsCount/pendingFollowUpsCount for the ' +
        "caller's in-scope beneficiaries (SAKHI: own; SUPERVISOR: roster; MANAGER/ADMIN: " +
        'unscoped), resolved via beneficiary-service since referrals carries no sakhiId ' +
        'column. Optional `sakhiId` narrows further to one Sakhi within that scope — used ' +
        "by the Sakhi dashboard to get one specific Sakhi's counts.",
      tags: ['Referrals'],
      responses: {
        200: { description: 'Referral counts', schema: envelope(referralSummarySchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(referralSummaryQuerySchema, 'query'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { sakhiId } = req.query as unknown as z.infer<typeof referralSummaryQuerySchema>;
      res.json(ok(await service.getSummary(req.user, authorizationHeader, sakhiId)));
    }),
  );

  doc.get(
    '/referrals/decision-status',
    {
      summary:
        'Real-time status for a batch of referral ids — internal use only, not part of the ' +
        "public Referrals API surface. Lets Quick Response's list() reconcile against the " +
        "referral's actual current status instead of trusting approval_requests' own cached " +
        'copy, since a referral can be decided directly via PATCH/POST ' +
        '/referrals/:id/decision, bypassing approval-service entirely. An id not found or ' +
        'soft-deleted is simply omitted from the result, not an error.',
      tags: ['Referrals'],
      query: decisionStatusQuerySchema,
      responses: {
        200: {
          description: 'Referral statuses for the requested ids',
          schema: envelope(z.array(decisionStatusRowSchema)),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(decisionStatusQuerySchema, 'query'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const ids = String(req.query.ids)
        .split(',')
        .map((id) => id.trim());
      res.json(ok(await service.getDecisionStatusByIds(ids, req.user, authorizationHeader)));
    }),
  );

  doc.get(
    '/referrals/:id',
    {
      summary:
        "A single referral's full detail plus its follow-up summary (incompleteCount, " +
        "latestFollowup) — added for Quick Response's card-enrichment endpoint " +
        '(approval-service resolves ACCOMPANIED_REFERRAL/REFERRAL_INCOMPLETE cards through ' +
        'this), not a general SAKHI-facing read; the app has no existing single-referral-' +
        'read flow. The follow-up summary is always computed, not gated by referral type — ' +
        'an ACCOMPANIED_REFERRAL caller simply ignores it.',
      tags: ['Referrals'],
      params: referralIdParamsSchema,
      responses: {
        200: {
          description: 'Referral detail with follow-up summary',
          schema: envelope(
            referralSchema.extend({
              incompleteCount: z.number().int(),
              latestFollowup: z
                .object({
                  followupDate: z.string().datetime(),
                  notVisitedReason: z.string().nullable(),
                  outcome: z.string().nullable(),
                })
                .nullable(),
            }),
          ),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: { description: 'Referral not found', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(referralIdParamsSchema, 'params'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(ok(await service.getById(req.params.id, req.user, authorizationHeader)));
    }),
  );

  doc.post(
    '/referrals/pending-followups-by-beneficiary',
    {
      summary:
        'Pending-follow-up counts per beneficiaryId, for the Pada Breakdown widget — the ' +
        "caller (api-gateway) sums these per pada using beneficiary-service's own " +
        'beneficiaryId -> padaId grouping. `beneficiaryIds` is intersected server-side with ' +
        "the caller's own scope (SAKHI: own; SUPERVISOR: roster; MANAGER/ADMIN: unscoped), " +
        'resolved via beneficiary-service since referrals carries no sakhiId column — never ' +
        'trusted as pre-scoped; an out-of-scope id is silently excluded from the result. ' +
        'Internal use only, not part of the public API surface.',
      tags: ['Referrals'],
      responses: {
        200: {
          description: 'Pending follow-up counts keyed by beneficiaryId',
          schema: envelope(pendingFollowupsByBeneficiaryResponseSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validateBody(countByBeneficiarySchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { beneficiaryIds } = req.body as { beneficiaryIds: string[] };
      const result = await service.getPendingFollowupsByBeneficiary(
        beneficiaryIds,
        req.user,
        authorizationHeader,
      );
      res.json(ok(Object.fromEntries(result)));
    }),
  );

  doc.post(
    '/referrals/followups-by-beneficiary',
    {
      summary:
        'Full PENDING follow-up cards (followupId, followupDate) for the Pada visit-list ' +
        'screen\'s "referral_follow_up" tab. Unfiltered by date — a pending follow-up doesn\'t ' +
        "disappear from this list just because its date passed or hasn't arrived. " +
        "`beneficiaryIds` is intersected server-side with the caller's own scope (SAKHI: own; " +
        'SUPERVISOR: roster; MANAGER/ADMIN: unscoped), resolved via beneficiary-service since ' +
        'referrals carries no sakhiId column — never trusted as pre-scoped. Internal use ' +
        'only, not part of the public API surface.',
      tags: ['Referrals'],
      responses: {
        200: {
          description: 'Pending follow-up cards',
          schema: envelope(
            z.array(
              z.object({
                followupId: z.string().uuid(),
                beneficiaryId: z.string().uuid(),
                followupDate: z.string().openapi({ example: '2026-08-20' }),
              }),
            ),
          ),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validateBody(followupsByBeneficiarySchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { beneficiaryIds } = req.body as { beneficiaryIds: string[] };
      res.json(
        ok(await service.getFollowupsByBeneficiary(beneficiaryIds, req.user, authorizationHeader)),
      );
    }),
  );

  doc.post(
    '/referrals',
    {
      summary:
        'Create a referral. validTill is server-computed as referralDate + 7 days and cannot ' +
        'be set by the caller. Idempotent on visitId: a second create for a visit that ' +
        'already has a referral returns the existing one (200) instead of erroring — the ' +
        'app is offline-first and a dropped-connection retry is a legitimate case.',
      tags: ['Referrals'],
      responses: {
        200: {
          description: 'An identical referral already existed for this visit — returned as-is',
          schema: envelope(referralSchema),
        },
        201: { description: 'Referral created', schema: envelope(referralSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        502: {
          description: 'A visit collision occurred but the existing referral could not be resolved',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validateBody(createReferralRequestSchema),
    asyncHandler(async (req, res) => {
      const { referral, alreadyExisted } = await service.create(req.body);
      res.status(alreadyExisted ? 200 : 201).json(ok(referral));
    }),
  );

  doc.patch(
    '/referrals/:id/decision',
    {
      summary: "Decide a referral's follow-up outcome (FR-SV-4.5, FR-SV-4.9)",
      tags: ['Referrals'],
      params: referralIdParamsSchema,
      responses: {
        200: { description: 'Referral decided', schema: envelope(referralSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: "Caller role not permitted, or outside this Supervisor's roster",
          schema: apiErrorSchema,
        },
        404: { description: 'Referral not found', schema: apiErrorSchema },
        409: { description: 'Referral is not in PENDING_FOLLOWUP status', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(referralIdParamsSchema, 'params'),
    validateBody(decideReferralRequestSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const updated = await service.decide(req.params.id, req.body, req.user, authorizationHeader);
      res.json(ok(updated));
    }),
  );

  doc.post(
    '/referrals/:id/decision',
    {
      summary:
        'Decide an Accompanied Referral — Supervisor app alias (POST, APPROVE/REJECT) of the ' +
        'PATCH endpoint above (FR-SV-4.9). Approve completes the referral and triggers the ' +
        'incentive; reject leaves it Pending, no incentive. SUPERVISOR-only, narrower than the ' +
        "PATCH endpoint's SUPERVISOR/MANAGER/ADMIN, since this is a new route with no existing " +
        'callers to preserve compatibility for.',
      tags: ['Referrals'],
      params: referralIdParamsSchema,
      responses: {
        200: { description: 'Referral decided', schema: envelope(referralSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: {
          description: "Caller role not permitted, or outside this Supervisor's roster",
          schema: apiErrorSchema,
        },
        404: { description: 'Referral not found', schema: apiErrorSchema },
        409: { description: 'Referral is not in PENDING_FOLLOWUP status', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SUPERVISOR'),
    validate(referralIdParamsSchema, 'params'),
    validateBody(decideReferralAliasRequestSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const updated = await service.decideAccompanied(
        req.params.id,
        req.body.decision,
        req.user,
        authorizationHeader,
      );
      res.json(ok(updated));
    }),
  );

  return doc;
}
