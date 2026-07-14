import { z } from 'zod';
import { mobileNumberSchema } from './mobile-number';

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
 * `.strict()` rejects unknown fields, matching the previous global
 * ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createUserSchema = z
  .object({
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
