import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { ReferralService } from './referral.service';
import { createReferralSchema } from './dto/create-referral.dto';
import { asyncHandler, createDocumentedRouter, ok, validateBody } from '../app.module';

extendZodWithOpenApi(z);

// Request DTO annotated with examples for Swagger UI; validation behavior is
// unchanged (`.openapi()` only attaches documentation metadata).
const createReferralRequestSchema = createReferralSchema.extend({
  beneficiaryId: createReferralSchema.shape.beneficiaryId.openapi({
    example: '3f3a8b0e-6b1a-4f2a-8f0a-3b6a0d9c1e2f',
  }),
  referralType: createReferralSchema.shape.referralType.openapi({ example: 'STANDARD' }),
  referralDate: createReferralSchema.shape.referralDate.openapi({
    example: '2026-07-16T00:00:00.000Z',
  }),
  status: createReferralSchema.shape.status.openapi({ example: 'INITIATED' }),
});

const referralSchema = z.object({
  id: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  visitId: z.string().uuid().nullable(),
  sourceSubmissionId: z.string().uuid().nullable(),
  referralType: z.enum(['STANDARD', 'ACCOMPANIED']),
  referralDate: z.string().datetime(),
  triggerConditionListJson: z.unknown().nullable(),
  facilityType: z.enum(['PUBLIC', 'PRIVATE', 'PHC', 'RH', 'DH', 'OTHER']).nullable(),
  facilityName: z.string().nullable(),
  status: z.enum(['INITIATED', 'PENDING_FOLLOWUP', 'COMPLETED', 'LAPSED', 'SKIPPED', 'CANCELLED']),
  validTill: z.string().datetime().nullable(),
  supervisorApprovalStatus: z.enum(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED']),
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
      summary: 'List the most recent referrals',
      tags: ['Referrals'],
      responses: {
        200: { description: 'Referrals list', schema: envelope(z.array(referralSchema)) },
      },
    },
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  doc.post(
    '/referrals',
    {
      summary: 'Create a referral',
      tags: ['Referrals'],
      responses: {
        201: { description: 'Referral created', schema: envelope(referralSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
      },
    },
    validateBody(createReferralRequestSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
