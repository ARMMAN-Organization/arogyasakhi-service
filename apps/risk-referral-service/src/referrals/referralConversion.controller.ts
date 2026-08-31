import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { ReferralConversionService } from './referralConversion.service';
import {
  asyncHandler,
  createDocumentedRouter,
  ok,
  requireRoles,
  trustGatewayIdentity,
  unauthorized,
  validate,
} from '../app.module';

extendZodWithOpenApi(z);

const referralIdParamsSchema = z
  .object({ id: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }) })
  .strict();

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  details: z.record(z.unknown()).optional(),
});

const referralSchema = z.object({
  id: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  referralTypeLookupValueId: z.string().uuid(),
  status: z.enum(['INITIATED', 'PENDING_FOLLOWUP', 'COMPLETED', 'LAPSED', 'SKIPPED', 'CANCELLED']),
  validTill: z.string().datetime().nullable(),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/** Referral type-conversion HTTP routes. Mounted under the global `api/v1` prefix. */
export function createReferralConversionRouter(service: ReferralConversionService) {
  const doc = createDocumentedRouter();

  doc.patch(
    '/referrals/:id/convert',
    {
      summary:
        'Convert a Standard referral to Accompanied (SRS FR-S-6.3, Appendix E.2). Must ' +
        'complete within the original 7-day validTill window — no extension is granted.',
      tags: ['Referrals'],
      params: referralIdParamsSchema,
      responses: {
        200: { description: 'Referral converted to Accompanied', schema: envelope(referralSchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: "Referral is outside this Sakhi's own roster", schema: apiErrorSchema },
        404: { description: 'Referral not found', schema: apiErrorSchema },
        409: {
          description:
            'Referral is not PENDING_FOLLOWUP, is already Accompanied, its 7-day window has ' +
            'closed, or it was changed by a concurrent request',
          schema: apiErrorSchema,
        },
        502: {
          description: 'Unable to resolve the ACCOMPANIED referral type',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validate(referralIdParamsSchema, 'params'),
    asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const result = await service.convertToAccompanied(
        req.params.id,
        req.user,
        authorizationHeader,
      );
      res.json(ok(result));
    }),
  );

  return doc;
}
