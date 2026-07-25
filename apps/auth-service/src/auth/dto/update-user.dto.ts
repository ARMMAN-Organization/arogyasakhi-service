import { z } from 'zod';
import { mobileNumberSchema } from './mobile-number';

/**
 * Partial update — every field optional, but at least one must be present.
 * `username`, `password`, and role/project/geography assignment are
 * intentionally excluded: username is the login identifier (changing it is
 * riskier and out of scope here), password changes belong on their own
 * dedicated flow, and role/project/geography reassignment is a separate
 * concern since a user can hold multiple role rows over time.
 */
export const updateUserSchema = z
  .object({
    displayName: z.string().trim().min(1).max(160),
    mobileNumber: mobileNumberSchema,
    email: z.string().trim().email().max(254).nullable(),
    status: z.enum(['ACTIVE', 'INACTIVE', 'LOCKED', 'PAUSED', 'DELETED']),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided.',
  });

export type UpdateUserInput = z.infer<typeof updateUserSchema>;
