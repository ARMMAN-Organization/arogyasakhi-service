import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { ReferralFollowupService } from './referralFollowup.service';
import { createReferralFollowupSchema } from './dto/create-referral-followup.dto';
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

const referralIdParamsSchema = z
  .object({ id: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }) })
  .strict();

// Documentation-only mirror of createReferralFollowupSchema's shape — see
// the route's own `body:` doc-option comment below for why.
const createReferralFollowupRequestSchema = z.object({
  visitedFacilityFlag: z.boolean().openapi({ example: true }),
  followupDate: z.coerce.date().openapi({ example: '2026-08-27' }),
  notVisitedReason: z.string().optional().openapi({ example: 'Facility closed' }),
  treatmentGiven: z.string().optional(),
  outcome: z.string().optional(),
  mediaAssetIds: z
    .array(z.string().uuid())
    .max(10)
    .optional()
    .openapi({ example: ['11111111-1111-1111-1111-111111111111'] }),
});

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  details: z.record(z.unknown()).optional(),
});

const referralFollowupResultSchema = z.object({
  followup: z.object({
    id: z.string().uuid(),
    referralId: z.string().uuid(),
    followupStatus: z.enum(['PENDING', 'COMPLETED', 'INCOMPLETE', 'LAPSED']),
  }),
  referral: z.object({
    id: z.string().uuid(),
    status: z.enum([
      'INITIATED',
      'PENDING_FOLLOWUP',
      'COMPLETED',
      'LAPSED',
      'SKIPPED',
      'CANCELLED',
    ]),
  }),
  mediaAssetIds: z.array(z.string().uuid()),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/** Referral follow-up HTTP routes. Mounted under the global `api/v1` prefix. */
export function createReferralFollowupRouter(service: ReferralFollowupService) {
  const doc = createDocumentedRouter();

  doc.post(
    '/referrals/:id/follow-up',
    {
      summary:
        "Submit a referral's follow-up outcome (SRS FR-S-6.3) — did the beneficiary visit " +
        'the facility? true completes the referral; false records it INCOMPLETE and leaves ' +
        'the referral PENDING_FOLLOWUP for Supervisor decision via the existing ' +
        'PATCH/POST /referrals/:id/decision. Accepts up to 10 mediaAssetIds (case paper, ' +
        'discharge summary, health facility photo, Sakhi-beneficiary photo, investigation ' +
        "reports) already finalized against media-service with this follow-up's real id.",
      tags: ['Referrals'],
      params: referralIdParamsSchema,
      // zod-to-openapi cannot introspect createReferralFollowupSchema's
      // whole-object .refine() (ZodEffects wraps the ZodObject, hiding
      // .shape) — this plain mirror is documentation-only; validateBody
      // below still enforces the real, refined schema.
      body: createReferralFollowupRequestSchema,
      responses: {
        201: { description: 'Follow-up recorded', schema: envelope(referralFollowupResultSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: "Referral is outside this Sakhi's own roster", schema: apiErrorSchema },
        404: { description: 'Referral not found', schema: apiErrorSchema },
        409: { description: 'Referral is not in PENDING_FOLLOWUP status', schema: apiErrorSchema },
        422: {
          description: 'One or more mediaAssetIds do not exist or are not viewable by this caller',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validate(referralIdParamsSchema, 'params'),
    validateBody(createReferralFollowupSchema),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const result = await service.create(req.params.id, req.body, req.user, authorizationHeader);
      res.status(201).json(ok(result));
    }),
  );

  return doc;
}
