import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { BeneficiaryRiskReferralService } from './beneficiaryRiskReferral.service';
import { createBeneficiaryRiskReferralController } from './beneficiaryRiskReferral.controller';
import {
  beneficiaryRiskReferralDetailsParamsSchema,
  beneficiaryRiskReferralsParamsSchema,
} from './dto/get-beneficiary-risk-referral.dto';
import { requireRoles, trustGatewayIdentity, validate, type DocumentedRouter } from '../app.module';

extendZodWithOpenApi(z);

const referralHeaderSchema = z.object({
  id: z.string().uuid(),
  beneficiaryId: z.string().uuid(),
  visitId: z.string().uuid().nullable(),
  referralTypeLookupValueId: z.string().uuid(),
  referralDate: z.string().datetime(),
  facilityType: z.enum(['PUBLIC', 'PRIVATE', 'PHC', 'RH', 'DH', 'OTHER']).nullable(),
  facilityName: z.string().nullable(),
  status: z.enum(['INITIATED', 'PENDING_FOLLOWUP', 'COMPLETED', 'LAPSED', 'SKIPPED', 'CANCELLED']),
  validTill: z.string().datetime().nullable(),
  supervisorApprovalStatus: z.enum(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED']),
});

const referralFollowupSchema = z.object({
  id: z.string().uuid(),
  followupDate: z.string().datetime(),
  visitedFacilityFlag: z.boolean().nullable(),
  notVisitedReason: z.string().nullable(),
  diagnosis: z.string().nullable(),
  treatmentGiven: z.string().nullable(),
  outcome: z.string().nullable(),
  casePaperMediaId: z.string().nullable(),
  followupStatus: z.enum(['PENDING', 'COMPLETED', 'INCOMPLETE', 'LAPSED']),
});

const referralTriggerSourceSchema = z.object({
  id: z.string().uuid(),
  riskFlagId: z.string().uuid().nullable(),
  riskConditionId: z.string().uuid().nullable(),
  sourceSubmissionId: z.string().uuid(),
  sourceFieldCode: z.string().nullable(),
  triggerReason: z.string().nullable(),
});

const referralDetailsSchema = z.object({
  referralId: z.string().uuid(),
  followups: z.array(referralFollowupSchema),
  triggerSources: z.array(referralTriggerSourceSchema),
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
 * Beneficiary risk-referral HTTP routes. Mounted under the global `api/v1`
 * prefix. Backs the reference Android app's "Beneficiary Data Download"
 * screen with a header/detail split: the list endpoint returns referral
 * headers only, the details endpoint returns one referral's followups +
 * trigger sources. Not part of the SRS/ERD/HLD; reverse engineered from
 * that reference app. Both are pure read projections over this service's
 * own tables — no writes, no cross-service calls.
 */
export function registerBeneficiaryRiskReferralRoutes(
  doc: DocumentedRouter,
  service: BeneficiaryRiskReferralService,
) {
  const controller = createBeneficiaryRiskReferralController(service);

  doc.get(
    '/beneficiaries/:beneficiaryId/risk-referrals',
    {
      summary:
        "A beneficiary's risk referrals, most recent referralDate first — header rows only " +
        '(no followups/triggerSources; see the /details endpoint for those).',
      tags: ['Beneficiary Risk Referrals'],
      params: beneficiaryRiskReferralsParamsSchema,
      responses: {
        200: {
          description:
            'Referral headers for the beneficiary. Empty array (not a 404) when the ' +
            'beneficiaryId has no referrals in this service.',
          schema: envelope(z.array(referralHeaderSchema)),
        },
        400: { description: 'Malformed beneficiaryId', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(beneficiaryRiskReferralsParamsSchema, 'params'),
    controller.listReferrals,
  );

  doc.get(
    '/beneficiaries/:beneficiaryId/risk-referrals/:referralId/details',
    {
      summary:
        "One referral's followups and trigger sources. 404s when the referral doesn't " +
        'exist, or exists but belongs to a different beneficiaryId than the one in the path.',
      tags: ['Beneficiary Risk Referrals'],
      params: beneficiaryRiskReferralDetailsParamsSchema,
      responses: {
        200: {
          description: 'Referral followups + trigger sources',
          schema: envelope(referralDetailsSchema),
        },
        400: { description: 'Malformed beneficiaryId/referralId', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        404: {
          description: 'Referral not found, or not owned by this beneficiaryId',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(beneficiaryRiskReferralDetailsParamsSchema, 'params'),
    controller.getReferralDetails,
  );
}
