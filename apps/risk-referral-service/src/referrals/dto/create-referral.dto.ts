import { z } from 'zod';

/** Recursive JSON value type usable inside nested objects/arrays (nulls allowed here). */
type NestedJsonValue =
  string | number | boolean | null | NestedJsonValue[] | { [key: string]: NestedJsonValue };

const nestedJsonValueSchema: z.ZodType<NestedJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(nestedJsonValueSchema),
    z.record(nestedJsonValueSchema),
  ]),
);

/**
 * Top-level JSON value schema matching Prisma's `InputJsonValue`, which — unlike
 * nested positions — does not accept a bare `null` (use `NullableJsonNullValueInput`
 * for that, not needed here since the field is simply omitted when absent).
 */
const jsonValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(nestedJsonValueSchema),
  z.record(nestedJsonValueSchema),
]);

/**
 * Validation schema for creating a referral. `.strict()` rejects unknown fields,
 * matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createReferralSchema = z
  .object({
    beneficiaryId: z.string().uuid(),
    visitId: z.string().uuid().optional(),
    sourceSubmissionId: z.string().uuid().optional(),
    // lookup_values.lookup_value_id (category REFERRAL_TYPE) — fetched via
    // GET /lookups/REFERRAL_TYPE (auth-service). Replaces the previous
    // STANDARD/ACCOMPANIED Postgres enum.
    referralTypeLookupValueId: z.string().uuid(),
    referralDate: z.coerce.date(),
    triggerConditionListJson: jsonValueSchema.optional(),
    facilityType: z.enum(['PUBLIC', 'PRIVATE', 'PHC', 'RH', 'DH', 'OTHER']).optional(),
    facilityName: z.string().trim().min(1).max(200).optional(),
    // media_assets.media_asset_id (category REFERRAL_HEALTH_FACILITY_PHOTO /
    // REFERRAL_SAKHI_BENEFICIARY_PHOTO) — owned by media-service, no
    // cross-service relation. Photo evidence for an accompanied referral.
    photoEvidenceMediaAssetId: z.string().uuid().optional(),
    status: z.enum([
      'INITIATED',
      'PENDING_FOLLOWUP',
      'COMPLETED',
      'LAPSED',
      'SKIPPED',
      'CANCELLED',
    ]),
    // validTill is server-computed (referralDate + 7 days) — see
    // ReferralService.create(). Not caller-settable.
    supervisorApprovalStatus: z
      .enum(['NOT_REQUIRED', 'PENDING', 'APPROVED', 'REJECTED'])
      .default('NOT_REQUIRED'),
  })
  .strict();

export type CreateReferralInput = z.infer<typeof createReferralSchema>;
