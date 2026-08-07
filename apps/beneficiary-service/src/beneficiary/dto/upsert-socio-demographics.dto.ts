import { z } from 'zod';

/**
 * Body for `PATCH /beneficiaries/:id/socio-demographics` — the
 * registration form's socio-demographic answers, sent as the form's own
 * `value_code` strings (e.g. "hindu", "10th_pass") rather than
 * lookup_value_id UUIDs.
 *
 * Why value_codes and not ids: the caller is visit-form-service forwarding a
 * MOTHER_REGISTRATION submission, and a form answer is a value_code by
 * definition (see options[].value_code in form-field.dto.ts). Resolving
 * those to lookup_values.lookup_value_id needs auth-service (which owns the
 * lookup master data), so it happens here — once, server-side — instead of
 * being duplicated into every calling service.
 *
 * All fields optional: a Sakhi may leave any of these unanswered, and this
 * endpoint is an upsert of whatever was answered, never a full replace of
 * fields the caller didn't mention.
 */
export const upsertSocioDemographicsSchema = z
  .object({
    /** PHONE_OWNER value_code — e.g. "self". */
    phoneOwner: z.string().trim().min(1).optional(),
    /** MOBILE_NETWORK_AVAILABILITY value_code — e.g. "full_network_available". */
    mobileNetworkAvailability: z.string().trim().min(1).optional(),
    /** EDUCATION_LEVEL value_code — e.g. "10th_pass". */
    educationLevel: z.string().trim().min(1).optional(),
    /** EDUCATION_LEVEL value_code (partner) — e.g. "12th_pass". */
    partnerEducationLevel: z.string().trim().min(1).optional(),
    /** PARTNER_OCCUPATION value_code — e.g. "farmer". */
    partnerOccupation: z.string().trim().min(1).optional(),
    /** MIGRATION_PATTERN value_code — e.g. "permanent_migration". */
    migrationPattern: z.string().trim().min(1).optional(),
    /** MONTHLY_INCOME_BRACKET value_code — e.g. "10001_15000". */
    monthlyIncome: z.string().trim().min(1).optional(),
    /** RELIGION value_code — e.g. "hindu". */
    religion: z.string().trim().min(1).optional(),
    /** SOCIAL_CATEGORY value_code — e.g. "obc". */
    socialCategory: z.string().trim().min(1).optional(),
    yearsInVillage: z.number().int().min(0).max(120).optional(),
    familyMembersCount: z.number().int().min(2).max(15).optional(),
    childrenUnder5Count: z.number().int().min(0).max(9).optional(),
  })
  .strict();

export type UpsertSocioDemographicsInput = z.infer<typeof upsertSocioDemographicsSchema>;
