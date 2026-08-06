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
 * Validation schema for creating an approval request. `.strict()` rejects
 * unknown fields, matching the previous global ValidationPipe
 * `forbidNonWhitelisted: true`.
 */
export const createApprovalRequestSchema = z
  .object({
    requestType: z.enum([
      'LMP_CHANGE',
      'REFERRAL_INCOMPLETE',
      'ACCOMPANIED_REFERRAL',
      'CLOSURE_REVIEW',
      'REOPEN',
      'DATA_RESTORE',
      'TRANSFER',
    ]),
    beneficiaryId: z.string().uuid().optional(),
    sourceEntityType: z.string().trim().min(1).max(80),
    sourceEntityId: z.string().uuid(),
    sourceSubmissionId: z.string().uuid().optional(),
    decisionReasonCodeLookupId: z.string().uuid().optional(),
    decisionNotes: z.string().trim().min(1).optional(),
    decidedByUserId: z.string().uuid().optional(),
    sourceAnswerId: z.string().uuid().optional(),
    referralId: z.string().uuid().optional(),
    closureId: z.string().uuid().optional(),
    reopenRequestId: z.string().uuid().optional(),
    requestedByUserId: z.string().uuid(),
    approverUserId: z.string().uuid().optional(),
    requestPayloadJson: jsonValueSchema.optional(),
    decisionStatusLookupId: z.string().uuid(),
    decisionPayloadJson: jsonValueSchema.optional(),
    decidedAt: z.coerce.date().optional(),
  })
  .strict();

export type CreateApprovalRequestInput = z.infer<typeof createApprovalRequestSchema>;
