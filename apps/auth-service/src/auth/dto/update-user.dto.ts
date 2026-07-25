import { z } from 'zod';
import { mobileNumberSchema } from './mobile-number';
import { usernameSchema } from './username';

/**
 * Partial update — every field optional, but at least one must be present.
 * Spans three tables in one request (per product decision — no separate
 * endpoints): `users` (identity/contact/status/credentials), the caller's
 * currently-active `user_roles` row selected by `roleCode` (project/geography
 * scope only — `roleCode` itself is immutable here; a role change is a new
 * grant, not an edit), and `sakhi_profiles` (SAKHI-only identity/bank
 * fields). `panNumber`/`aadhaarNumber`/`bankAccountNumber` are accepted as
 * plaintext and encrypted server-side before storage — never persisted or
 * echoed back in plaintext.
 */
export const updateUserSchema = z
  .object({
    // users
    username: usernameSchema,
    password: z.string().min(8).max(200),
    displayName: z.string().trim().min(1).max(160),
    mobileNumber: mobileNumberSchema,
    email: z.string().trim().email().max(254).nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED', 'PAUSED', 'DELETED']),

    // user_roles scope (identifies which active role row to update)
    roleCode: z.string().trim().min(1).max(50),
    projectId: z.string().uuid().nullable(),
    geographyUnitId: z.string().uuid().nullable(),

    // sakhi_profiles
    employeeCode: z.string().trim().min(1).max(80),
    supervisorId: z.string().uuid().nullable(),
    phoneNumber: mobileNumberSchema,
    backupContact: mobileNumberSchema.nullable(),
    ifscCode: z.string().trim().min(1).max(20),
    panNumber: z.string().trim().min(1),
    aadhaarNumber: z.string().trim().min(1),
    bankAccountNumber: z.string().trim().min(1),
    activeFrom: z.string().trim().date(),
    activeTo: z.string().trim().date().nullable(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  })
  .refine(
    (data) =>
      !((data.projectId !== undefined || data.geographyUnitId !== undefined) && !data.roleCode),
    {
      message: 'roleCode: Required when updating projectId or geographyUnitId.',
    },
  )
  .refine(
    (data) =>
      !(data.roleCode && data.projectId === undefined && data.geographyUnitId === undefined),
    {
      message: 'projectId or geographyUnitId: Required when roleCode is provided.',
    },
  )
  .refine(
    (data) =>
      !(data.activeFrom && data.activeTo && new Date(data.activeTo) < new Date(data.activeFrom)),
    { message: 'activeTo: Must not be before activeFrom.' },
  );

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
