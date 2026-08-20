import { z } from 'zod';
import { mobileNumberSchema } from './mobile-number';
import { usernameSchema } from './username';

/**
 * Validation schema for creating a user. Fields match `users`
 * (docs/Arogya_Sakhi_Database_Design_ERD_Table_Definitions.docx.md,
 * Appendix A.1) — no invented fields. `passwordHash`, `status`,
 * `lastLoginAt`, `failedLoginCount`, `passwordChangedAt`, and the audit
 * columns are server-set, not client input; `password` is the plaintext
 * input the server hashes before persisting.
 * `roleCode` is not a `users` column — it selects the `roles` row to link
 * via an initial `user_roles` assignment, mirroring how the seed script
 * provisions a user with a role in one step.
 * `username` is required (not an ERD column) since login is username +
 * password for every role — a user created without one could never log in.
 * `.strict()` rejects unknown fields, matching the previous global
 * ValidationPipe `forbidNonWhitelisted: true`.
 *
 * `projectId` is optional here (zod can't express "required only when
 * roleCode is SAKHI" on a flat object) but AuthService.createUser enforces
 * it as required for roleCode SAKHI — sakhi_profiles.primary_project_id is
 * NOT NULL, and that row is created in the same transaction as the user so
 * a SAKHI never exists without one (see AuthRepository.createUserWithRole).
 */
export const createUserSchema = z
  .object({
    username: usernameSchema,
    mobileNumber: mobileNumberSchema,
    password: z.string().min(8).max(200),
    displayName: z.string().trim().min(1).max(160),
    email: z.string().trim().email().max(254).optional(),
    roleCode: z.string().trim().min(1).max(50),
    projectId: z.string().uuid().optional(),
    geographyUnitId: z.string().uuid().optional(),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;
